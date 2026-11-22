# Cytex detection integration

Live detection was enabled in the local backend `.env` on September 27 at the user's
request, after a separate authorized smoke test (one prompt, two entries per service,
one request per API). Both APIs returned HTTP 200. DLP found the synthetic card but not
the example email; API detection accuracy remains a limitation outside this adapter.
No additional external calls were made during that enablement. All automated
adapter tests use mocks. `REMOTE_DETECTION_ENABLED` still defaults to `false` for new
installations; tests force it off unless an individual test replaces the transport.

## Scope and payloads

The protected execution path reads the authenticated user's current database memberships,
keeps active groups in the same organization, and resolves active policies assigned to
those groups. Managed catalogs never interpret an empty group list as global scope.
The selected entry IDs and policy versions are frozen in the run snapshot. Client-supplied
group selections cannot expand scope. Each group has its own selected check IDs.
For users in multiple assigned groups, their selections are combined and deduplicated
before the policy snapshot is saved. Other groups' checks are not included. Overlapping
group assignments do not duplicate a policy or detector request.
Red-team protected runs use their existing frozen subject/policy snapshots.

- DLP: POST `https://lambda10.cytex.io/api/v1/detect` with `text`, the exact selected
  `pattern_ids`, and `custom_patterns: []`. `x-api-key` comes from `DLP_DETECTION_API_KEY`.
- Guardrail: POST `https://centurion.cytex.io/api/v1/batch-detect` with `output`, only
  the selected `{ "pluginId": "...", "config": {} }` entries, and `includePassing: false`.
- Missing, empty, duplicate, or unknown entry selections fail closed; no default-all request.
- Only DLP assigned: no Guardrail request. Only Guardrail assigned: no DLP request.
- Neither assigned: no detector request. Existing `require_active_policy` settings still
  determine whether the app blocks the run or allows an unchecked provider call.

The existing stage behavior is retained: input checks cover the user prompt and nonempty
server-managed system instruction; output-stage policies check the generated response
before release. Empty fields are skipped. Requests are synchronous within the existing
protected execution service, bounded by the stage budget, without retries or redirects.
Both policy types are evaluated when applicable and budget permits; an incomplete check
prevents release. A detector outage is never treated as a clean result.

## Response contract

The adapter requires findings-only responses. DLP uses selected pattern IDs:

```json
{"detections": [{"pattern_id": "selected-dlp-id"}]}
```

```json
{"results": [{"pluginId": "selected-guardrail-id", "pass": false, "score": 0.0}],
 "violations": {"Check name": 1},
 "summary": {"total": 1, "passed": 0, "failed": 1}}
```

An explicit empty array represents a completed clean check under this provisional contract.
Missing arrays, unknown IDs, non-200 statuses, invalid JSON, explicit errors, partial or
incomplete results, and unexpected result statuses fail closed. Guardrail's boolean
`pass: false` is a policy match, not a detector failure. `pass: true` contradicts our
findings-only request and is rejected, along with nonboolean flags, duplicate Guardrail
IDs, explicit errors, and the unconfirmed `passed` alias. DLP pass flags remain rejected.
Only entry IDs and finding counts are retained, never matched text or raw response bodies.

On October 11, 2026, the public [Guardrail OpenAPI schema](https://centurion.cytex.io/openapi.json)
confirmed that `includePassing: false` returns failing grades only. One harmless synthetic
Unicode check confirmed an actual finding with `pluginId`, boolean `pass: false`, and
consistent summary counts. The previous adapter incorrectly rejected that finding. Its
`cytex-findings-v2` replacement accepts this confirmed format; legacy ID-only findings
remain supported. Automated regression tests use mocks and exercise both blocked stages.

New response shapes, partial-failure semantics, authentication needs, and plugin-specific
configuration requirements still require confirmation from the API developers. No settings
are inferred from catalog metadata; `config: {}` follows the user-provided request example.

## Configuration

```dotenv
REMOTE_DETECTION_ENABLED=true
DLP_DETECTION_API_KEY=
REMOTE_DETECTION_TIMEOUT_SECONDS=15
VALIDATION_STAGE_TIMEOUT_MS=30000
```

Store the key only in backend secret configuration. The current local development instance
uses the temporary key supplied and tested by the user; replace it before production.
No key is hardcoded in application source or returned to the browser.
The existing `VALIDATION_STAGE_TIMEOUT_MS` remains the total stage budget; each request
receives the remaining budget capped by the remote timeout. Response size is capped at
1 MiB. Readiness reports configuration only, never remote availability through a probe.
When disabled, assigned catalog evaluation returns `remote_detection_disabled` and prevents
unchecked provider dispatch. Restart the backend after changing configuration.

Verification after client enablement: full backend suite 125 passed (8 dependency deprecation warnings), frontend
lint/build passed. Tests cover current DB group memberships, DLP-only/Guardrail-only/both/
neither routing, exact selections, disabled transport, safe evidence, provider blocking,
timeouts, redirects, oversized/malformed/error responses, and preserved existing behavior.

The browser distinguishes blocked input, withheld output, and failed security checks.
Matched entry names come from the saved catalog, not untrusted remote descriptions.
The observed Guardrail summary (`total`, `passed`, `failed`) is validated when present;
missing checks or inconsistent counts fail closed. No groups or policy selections were
changed by the adapter fix.

## Diagnosing a checking error

IBAN matching uses DLP, whereas harmful-content grading uses Guardrail. A working IBAN
block does not confirm that Guardrail checks complete. A blocking match also takes
precedence over another check's error in the overall run decision.

`detector_invalid_response` can indicate an incompatible response contract. The adapter
fix handles the observed Guardrail violation format. `detector_timeout` and `stage_timeout`
are separate latency problems: the October 11 synthetic Guardrail check reported roughly
15 seconds of server processing. It used LLM grading, while some checks are programmatic.
Four-second production limits can therefore stop a healthy check before it completes.
The UI opens error details automatically and shows the policy, stage, and reason code.

The settings above are a local diagnostic example, not a guarantee that synchronous
Heroku requests finish within its router deadline. Each stage can check several fields
and policies, and allowed input adds provider execution plus output checking. Long runs
require background execution and polling; increasing only a timeout does not solve the
hosting deadline. See [backend deployment guidance](../backend/DEPLOYMENT.md).
