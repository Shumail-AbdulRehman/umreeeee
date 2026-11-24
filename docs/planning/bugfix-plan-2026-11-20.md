# Bug-fix plan — 5 defects found during the 2026-11-19 Red Team run

Executor: a Codex session. Author: Claude (diagnosis done; every cause below was verified on the real code).
Background: `docs/planning/real-data-and-red-team-run-report.md` (section "Red Team run" lists bugs 1–4).

## Hard rules — read before touching anything

1. **Edit only the files listed under each bug** ("Allowed files"). If a fix seems to need any other file, do NOT edit it:
   write the reason in the final report and move on. Never edit `.env`, `requirements*.txt`, `package.json`,
   lockfiles, Procfiles, specs, design files, or any frontend file.
2. **Minimal diffs.** No refactors, renames, reformatting, import reordering, comment rewrites, new dependencies,
   or "while I'm here" improvements. Do not change any public API shape, error *code*, HTTP status, database field
   name, or existing behaviour that is not named in this plan.
3. **Legacy stays as is.** Do not change `backend/app/red_team/evaluators.py`, `catalog.json`, `catalog_schema.py`
   (the v2 legacy path) or anything under `Frontend/`.
4. **Tests:** add or update tests only in the test files named per bug. Update an existing assertion only when it
   asserted the buggy behaviour, and say so in the report.
5. **Do not touch running state.** An API (port 8000), worker, dispatcher, recovery process and RabbitMQ container
   are running. Do not kill, restart or reconfigure them. Do not read or write the real MongoDB (Atlas); do not call
   any live provider. All tests must use fakes. Integration tests skip without `TEST_MONGODB_URL` — leave that unset.
6. **No git commits, no branch changes, no stash.** The working tree already has many uncommitted changes from the
   owner; leave them exactly as they are. Before starting, save `git diff --stat > /tmp/bugfix/diffstat-before.txt`
   and `git status --porcelain > /tmp/bugfix/status-before.txt` so your own changes can be isolated.
7. Never print or log API keys, tokens or prompt/response content in new code.

## Bug 1 — every successful RabbitMQ publish is treated as a failure

- **Cause (verified):** `backend/app/queue/rabbit.py:122` does
  `if not self.channel.basic_publish(...): raise RuntimeError('Broker did not confirm publication')`.
  With pika 1.4.4 (installed), `BlockingChannel.basic_publish` returns `None` on success and, because
  `confirm_delivery()` is on, *raises* `pika.exceptions.UnroutableError` / `NackError` on failure.
  So every confirmed publish raises; the dispatcher resets the job to `pending` and republishes it repeatedly.
- **Fix:** call `basic_publish(...)` without testing its return value. Keep `mandatory=True`, persistent delivery,
  content type and `confirm_delivery()` exactly as they are. Failures still raise pika exceptions, which
  `dispatch_once` already catches (`except Exception`) and turns into a backoff — do not change `dispatch_once`.
- **Allowed files:** `backend/app/queue/rabbit.py`; new test file `backend/tests/unit/test_rabbit_publisher.py`.
- **Tests:** with a fake channel (no real broker; construct `RabbitPublisher` via `object.__new__` or patch
  `connection()`), assert: (a) `publish()` returns normally when `basic_publish` returns `None`;
  (b) an exception raised by `basic_publish` propagates; (c) the body is the compact JSON of the message and
  `mandatory=True`, `routing_key=RED_TEAM_QUEUE_NAME`.

## Bug 2 — dispatcher and recovery die on a transient MongoDB error

- **Cause (verified):** in `backend/app/queue/dispatcher.py` `main()`, `heartbeat(db)` (line ~67) runs *outside*
  the `try`, so a MongoDB network error (`AutoReconnect`, `_OperationCancelled`, `ServerSelectionTimeoutError`, …)
  kills the process. In `backend/app/queue/recovery.py` the `__main__` loop
  (`while True: print(recover(database)); sleep(15)`) has no error handling at all. Both crashed overnight.
- **Fix:**
  - dispatcher: move `heartbeat(db)` inside the existing `try`. Keep the existing `except KeyboardInterrupt: break`
    and the existing generic `except Exception` reconnect branch (it logs, closes the publisher, sleeps 2 s) — that
    branch must now also cover heartbeat failures. No other change.
  - recovery: extract the loop into a small `main(database=None, sleep=time.sleep, iterations=None)` function
    (the `iterations` parameter exists only so tests can stop the loop) and call it from `if __name__ == '__main__'`.
    Inside the loop: `print(recover(database), flush=True)` in a `try`; on `KeyboardInterrupt` exit; on any other
    `Exception` log a warning with only the exception *type name* (match the dispatcher's style:
    `logger.warning('Red-team recovery retrying (%s)', type(exc).__name__)`) and continue; always sleep 15 s
    between iterations. Do not change `recover()` itself.
- **Allowed files:** `backend/app/queue/dispatcher.py`, `backend/app/queue/recovery.py`;
  new test file `backend/tests/unit/test_queue_resilience.py`.
- **Tests:** (a) dispatcher `main()` with a fake db whose first heartbeat raises `pymongo.errors.AutoReconnect`
  keeps looping and later dispatches (patch `sleep`, `RabbitPublisher`, `dispatch_once`; end the loop by raising
  `KeyboardInterrupt` from a later call); (b) recovery `main()` with a `recover` that raises once then returns
  counts runs the requested iterations without raising and sleeps between them.

## Bug 3 — model discovery gets HTTP 403 from Groq (and possibly other providers)

- **Cause (verified):** `backend/app/services/llm_integration_service.py` builds discovery requests with
  `urllib.request.Request` and no `User-Agent`, so urllib sends `Python-urllib/3.x`. Groq's Cloudflare edge rejects
  that agent with `403 error code: 1010`; the same key returns 200 with any other agent (checked with
  `User-Agent: Sentinel/1.0`).
- **Fix:** add one module-level constant, e.g. `DISCOVERY_USER_AGENT = 'Sentinel-LLM-Security/1.0'`, and add a
  `'User-Agent': DISCOVERY_USER_AGENT` header to every discovery `Request` in that file
  (`fetch_openai_compatible_models`, `fetch_gemini_models`, `fetch_anthropic_models`, `fetch_ollama_models`).
  Keep every other header, URL, method, redirect handler and error mapping unchanged. Do not touch
  `provider_service.py` for this bug (httpx already sends its own agent and works).
- **Allowed files:** `backend/app/services/llm_integration_service.py`; tests in a new file
  `backend/tests/unit/test_model_discovery_headers.py`.
- **Tests:** patch `read_json_response` (or the opener it uses) to capture the `Request`; assert each of the four
  fetchers sends the `User-Agent` header, and that the Authorization / x-api-key headers are still present
  for the providers that had them.

## Bug 4 — provider errors hide the provider's real reason

- **Cause (verified):** `backend/app/services/provider_service.py` maps any non-2xx status to a code
  (`429 → rate_limited`, etc.) without reading the body, so users only see e.g. "Provider rate limit reached."
  even when Gemini says the free-tier daily quota (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`) is spent.
  Separately, `normalize()` raises `invalid_response` when a model returns empty text — this happened for
  reasoning models that used the whole `max_tokens` budget (`finish_reason: length`), and the message gave no hint.
- **Fix (keep every error *code*, status mapping, retry_after and retry behaviour identical):**
  1. Give `ProviderError.__init__` an optional keyword `detail=None`. Sanitize it: keep only characters in
     `[A-Za-z0-9 _.:/()=-]`, collapse whitespace, cap at 120 chars; drop it if empty. When present, set
     `self.message = base_message + ' (' + detail + ')'` and store `self.detail`. With no detail, the message must
     be byte-for-byte what it is today.
  2. On a non-2xx response, read at most 8 KB of the body (use the already-open stream; never read more), parse
     JSON defensively, and build `detail` from **identifiers only**, never free-form message text:
     - Gemini: `error.status` plus the first `error.details[].violations[].quotaId` if present
       (e.g. `RESOURCE_EXHAUSTED: GenerateRequestsPerDayPerProjectPerModel-FreeTier`).
     - OpenAI-compatible (openai, groq, deepseek): `error.type` and/or `error.code` when they are strings.
     - Anthropic: `error.type`.
     - Anything else, unparsable bodies, or non-string values: no detail.
     Any failure while extracting detail must be swallowed and must not change the raised code.
  3. In `normalize()`, when the text is empty/non-string, raise `ProviderError('invalid_response',
     detail='empty reply, finish_reason=<value>')` using the already-parsed `finish` value when it is a short
     string; keep the existing `invalid_response` for the other cases (too long, malformed) unchanged.
  The message already flows to Prompt Studio (`error_message`) and Red Team (`explanation`) — do not edit those
  services.
- **Allowed files:** `backend/app/services/provider_service.py`; tests appended to
  `backend/tests/unit/test_phase2_validators_providers.py` (follow its existing fake-transport style) or a new file
  `backend/tests/unit/test_provider_error_detail.py`.
- **Tests:** using `httpx.MockTransport` through `ProviderService(transport=...)`: a Gemini 429 with a quota body
  yields code `rate_limited` and a message containing the quotaId; a Groq 401 with `error.type` yields
  `authentication` plus the type; a body containing an API-key-looking string or a long free-text `message`
  never appears in the message; a 429 with no JSON body gives exactly today's message; an OpenAI-compatible 200
  with empty content and `finish_reason: "length"` gives `invalid_response` with `finish_reason=length` in the
  message; `retry_after` parsing is unchanged.

## Bug 5 — protected Red Team credits blocks caused by the harness's own scenario text

- **Cause (verified):** protected runs evaluate input rules on both `user_prompt` and `system_prompt`
  (`enforcement_service.py:50`). The Red Team system prompt is the integration prompt plus the synthetic scenario
  (it contains e.g. a synthetic email for the `pii` plugin and phrases like "private marker"). The v3 grader
  (`backend/app/red_team/evidence.py:105`) credits *any* matched rule as `pass / policy`, so a block caused only by
  the scenario text is counted as a passing test case (reproduced with an email-PII rule: the PII test case was blocked
  with matches only on `system_prompt`). For controls the same artefact would look like over-blocking.
- **Fix (v3 grader only):** in `grade()`, when the protected status is `blocked_input`/`blocked_output`, count only
  rule results with `outcome == 'match'` whose `field != 'system_prompt'` as evidence. Then:
  - at least one such match → behave exactly as today (`pass / policy` for adversarial test cases, `fail / policy` with
    `control_blocked` for controls);
  - matches exist but **all** are on `system_prompt` → return `verdict 'error'`, `verdict_source 'none'`,
    reason `harness_text_block`, explanation "Blocked only by the test's own scenario text, not the attack;
    excluded from scoring.", steps: policy `undecided` with that description, exact `skipped` "No reply to
    inspect.", judge `skipped` "Not reached." — for both adversarial test cases and controls;
  - no matches at all → unchanged (`unverified_block`).
  Errors are already excluded from every rate by the report code; do not change `red_team_report_v3.py`,
  `enforcement_service.py`, the worker, or the legacy `evaluators.py`.
- **Allowed files:** `backend/app/red_team/evidence.py`; tests appended to `backend/tests/unit/test_red_team_evidence.py`.
- **Tests:** test case blocked with matches only on `system_prompt` → `error / none / harness_text_block`; test case with
  matches on `user_prompt` and `system_prompt` → `pass / policy` (unchanged); control blocked only via
  `system_prompt` → `error / harness_text_block` (not `control_blocked`); output-stage block on `response_text`
  → unchanged `pass / policy`; existing evidence tests still pass unmodified.

## Verification (all must pass; paste the summary lines into the report)

From `backend/` with `.venv`:
1. `.venv/bin/python -m pytest -q tests/unit` — all pass (baseline before this work: 464 passed; your new tests add
   to that). Also run `.venv/bin/python -m pytest -q tests/integration` once to confirm it only *skips*
   (no `TEST_MONGODB_URL`); do not set that variable.
2. `.venv/bin/python -m compileall -q app` — clean.
From `Frontend/` (no frontend files are edited, this only proves nothing broke):
3. `npx vitest run` — all pass.
Scope check:
4. `git diff --stat` compared with `/tmp/bugfix/diffstat-before.txt` and `git status --porcelain` compared with
   `/tmp/bugfix/status-before.txt` must show changes **only** in: `backend/app/queue/rabbit.py`,
   `backend/app/queue/dispatcher.py`, `backend/app/queue/recovery.py`,
   `backend/app/services/llm_integration_service.py`, `backend/app/services/provider_service.py`,
   `backend/app/red_team/evidence.py`, the test files named above, and the report file below. If anything else
   changed, revert your change to it.

## Report

Write `docs/planning/bugfix-report-2026-11-20.md`: per bug — what changed (file:line), the tests added, and the
before/after behaviour in one or two sentences; the full verification output summary; the scope-check result; and
anything you chose not to do and why. Keep it factual and short.
