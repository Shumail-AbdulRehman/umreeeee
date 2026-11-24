# promptfoo as the red-team engine behind the Python worker

Researched 2026-11-22 for promptfoo 0.126.0

Scope: how the app's Python worker (`python -m app.workers.red_team_worker`) can run promptfoo's red-team engine while every test prompt still goes through `ProtectedPromptService.execute_protected(...)` (protected mode) or straight to the LLM provider (raw mode). Also covers output, headless operation, install footprint and Heroku. Plugins, strategies, grading and remote generation are left to the companion research.

## 0. Method and evidence types

- **Docs:** promptfoo.dev pages (most marked "Last updated Nov 21, 2026") and Heroku Dev Center pages, each cited inline.
- **Package source:** the published npm tarball `https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz`, unpacked and read, including `dist/src/index.d.ts` and the bundled JS. Bundle comments name the original module (for example `// src/node/doEval.ts`), and citations use that name. Below, **[tarball: `src/...`]** means "read in the 0.126.0 tarball at that original module". The GitHub repo is `https://github.com/promptfoo/promptfoo`, but `main` may have moved since 0.126.0.
- **Local measurements:** promptfoo 0.126.0 installed with `npm install --ignore-scripts` into a scratch directory, then run against a dummy Python provider. Environment: Node v24.14.1, Python 3.12.3, Linux x64. `PROMPTFOO_CONFIG_DIR` pointed at a scratch directory, with telemetry, update checks and sharing turned off. Marked **[measured]** below. Nothing in the project was changed.
- **npm registry metadata:** `npm view promptfoo@0.126.0` gives `engines.node >=22.22.0`, `dist.unpackedSize 34,369,743`, `bin {promptfoo, pf} -> dist/src/entrypoint.js`, `exports "." {import: index.js, require: index.cjs}`, and last modified 2026-11-18 (https://registry.npmjs.org/promptfoo).

---

## 1. Custom target providers usable for red teaming

promptfoo red-team targets go under top-level `targets:`. Each `id` can be a model, a Python script (`file://send_redteam.py`), an HTTP endpoint (`url`/`method`/`headers`/`body`/`transformResponse`), a JavaScript provider, or "any other executable" via `exec:` (https://www.promptfoo.dev/docs/red-team/configuration/). Target calls always run locally, even when test case generation is remote (same page).

### 1a. Python provider: `file://provider.py`

**Signature and inputs**
- `def call_api(prompt, options, context):`. `async def` is also supported. `call_embedding_api(prompt, options)` and `call_classification_api(prompt, options)` also exist. Only `call_api` receives `context` (https://www.promptfoo.dev/docs/providers/python/).
- A different function name uses `file://my_provider.py:generate_response` (same page). The wrapper also resolves `Class.method` syntax ([tarball: `src/python/persistent_wrapper.py`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz), `get_callable`).
- `prompt` is a string, or a JSON-encoded chat conversation (python docs).
- `options` holds `id` and `config`. Everything under the provider's `config:` block arrives in `options['config']`, and promptfoo adds `config['basePath']` (the config file's directory) (python docs).
- `context` holds:
  - `vars`, `prompt` (`raw`, `label`, `config`) and `test` (`vars`, `metadata`). In red-team runs, `context['test']['metadata']` carries `pluginId` and `strategyId`.
  - `evaluationId`, `testCaseId`, `testIdx`, `promptIdx` and `repeatIndex`.
  - Non-serializable fields (`logger`, `getCache`, `filters`, `originalProvider`) are stripped.
  - Source: python docs. The full field list is `CallApiContextParams` in `dist/src/index.d.ts`, which also has `traceparent`, `debug`, `isGrading` and `bustCache` ([tarball](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz)).

**Return dict**
- Keys: `output`, `error`, `tokenUsage` (`total`, `prompt`, `completion`, `numRequests`), `cost`, `cached`, `logProbs`, `latencyMs`, `conversationEnded`, `conversationEndReason`, `guardrails` (`flagged`, `flaggedInput`, `flaggedOutput`, `reason`) and `metadata`.
- The docs say: "Return at least one of `output` or `error`." Without `tokenUsage.numRequests`, a fresh result counts as one request (https://www.promptfoo.dev/docs/providers/python/).
- The full TypeScript type is `ProviderResponse`. It also has `prompt` (overrides the displayed prompt), `raw`, `finishReason`, `isRefusal`, `sessionId` and `incurredCost` ([tarball: `dist/src/transform-*.d.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz)).
- **[measured]** Keys returned in `metadata` are merged with `testCase.metadata` into each result's `metadata`. A test with `pluginId`/`strategyId` metadata and a provider returning `{"idempotencyKey": ..., "pid": ...}` gave `metadata = {pluginId, strategyId, idempotencyKey, pid, _promptfooFileMetadata}`.

**How promptfoo launches Python**
- **Persistent workers.** The script is loaded once per worker, not once per call (python docs).
- **Protocol.** Node starts `persistent_wrapper.py <script> <function>`. The worker prints `READY`. Node sends `CALL|<function>|<request_file>|<response_file>` on stdin. Arguments and results travel through temp JSON files, and completion is signalled with `DONE|<file>` on stdout. ([tarball: `src/python/persistent_wrapper.py`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz))
  - Async functions run through `asyncio.run(...)` **on every call**, so no event loop persists between calls (same file).
  - The wrapper inserts the **script's own directory** into `sys.path` (`load_user_module`). For `import app.services...` to work, the backend root must be on `PYTHONPATH`, or the provider file must add it.
- **Worker count.** The docs say `config.workers` defaults to 1, with `PROMPTFOO_PYTHON_WORKERS` as a global override (python docs). The source's priority is `config.workers` > `PROMPTFOO_PYTHON_WORKERS` > **the `-j/--max-concurrency` value** > 1 ([tarball: `src/providers/pythonCompletion.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz), `getWorkerCount`). So `-j 4` without `workers:` starts **4 Python processes**.
- **Queueing.** Each worker handles one call at a time, and extra calls queue ([tarball: `src/python/workerPool.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz)).
- **Timeout.** `config.timeout` in ms, default 300 s. The global override is `REQUEST_TIMEOUT_MS`. A timeout restarts that worker. After 3 consecutive crashes with no successful call in between, the worker stops restarting (python docs).
- **Interpreter.** `config.pythonExecutable`, or the `PROMPTFOO_PYTHON` env var. Otherwise it is auto-detected (python docs; https://www.promptfoo.dev/docs/usage/troubleshooting/).
- **Environment.** Python inherits the shell environment and `--env-file`. Provider-level `env:` overrides do **not** reach the child process, so set `PATH`/`PYTHONPATH` in the parent environment (python docs).
- **State.** Global state is not shared across workers. Use `workers: 1` for session-dependent flows (python docs).
- **Debugging.** `LOG_LEVEL=debug` shows `print` output, and `PROMPTFOO_PYTHON_DEBUG_ENABLED=true` allows `pdb` (python docs). stdout is the control channel, so logging should go to stderr.
- **Caching (important).**
  - Results are cached under `python:<scriptPath>:<fn>:<apiType>:<sha256(script)>:<prompt>:<JSON(options)>:<JSON(vars)>`. Only results without `error` are stored ([tarball: `src/providers/pythonCompletion.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz), `executePythonScript`).
  - With the cache on, re-running identical test cases returns the stored answer **without calling `execute_protected`**. See §4 for how to turn it off.

**Red-team specifics**
- `conversationEnded: True` ends multi-turn test conversations gracefully (python docs).
- `guardrails` is the documented place to report a block ("Guardrail decisions go in `guardrails`, not inside `output` or `metadata`") (https://www.promptfoo.dev/docs/providers/custom-api/).
- How graders score a guardrail-flagged response belongs to the companion research.

### 1b. HTTP provider (`id: https://...`)

- **Config keys:** `url`, `method`, `headers`, `body`, `queryParams`, `request` (raw HTTP), `transformRequest`, `transformResponse`, `tokenEstimation`, `maxRetries`, `validateStatus`, `auth` (`bearer`, `api_key`, `basic`, `oauth`, `file`), `signatureAuth`, `tls` and `multipart` (https://www.promptfoo.dev/docs/providers/http/).
- **Templating:**
  - `{{prompt}}` and test vars are substituted. `{{evaluationId}}` is injected. Objects go in with `| dump`.
  - A string body is sent as `text/plain` and an object body as JSON (http docs).
  - Header values are rendered with Nunjucks against vars that include `prompt`, `evaluationId`, test vars and auth-injected `token`/`signature`/`sessionId` ([tarball: `src/providers/http.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz), `getHeaders`, `callApiInternal`).
- **transformResponse:** a string expression (`json`, `text`, `context`), a function, or `file://x.js[:fn]`. It returns a string or a full `ProviderResponse` (`output`, `tokenUsage`, `cost`, `metadata`, `guardrails`, `conversationEnded`, `sessionId`, `error`, ...) (http docs).
- **Sessions:**
  - Server-side: `sessionParser` (for example `data.headers["x-session-id"]`) feeds `{{sessionId}}`.
  - Client-side: `defaultTest.options.transformVars: '{ ...vars, sessionId: context.uuid }'` (http docs).
- **Per-request unique header (Idempotency-Key):** there is **no built-in per-call UUID**.
  - The HTTP docs have no `{{uuid}}`.
  - Headers render with a Nunjucks engine that has only the `env` global, and custom `nunjucksFilters` are not passed to it ([tarball: `src/providers/http.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz), `src/util/render`).
  - `context.uuid` exists only inside `transformVars`, which runs **once per test case** ([tarball: `src/evaluator/engine.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz), `applyInputTransform`). Every turn of a multi-turn strategy, and every retry, would reuse the same key.
  - Headers are rendered **before** `transformRequest` runs, so `transformRequest` cannot set them (same file).
- **Retries and errors:**
  - `maxRetries` defaults to 4. 429s, network errors and 502/503/504/524 are retried with backoff. `PROMPTFOO_RETRY_5XX=true` retries all 5xx (http docs).
  - `validateStatus` accepts every status by default (http docs).
  - A non-retryable 401/403/404/501 aborts the scan with "Target is unavailable" ([tarball: `src/util/eval/summary.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz)).
- **Heroku constraint:** the router gives a web request 30 s to return its first byte (https://devcenter.heroku.com/articles/limits). A protected call that waits on a slow LLM can hit H12 through the public URL.

### 1c. `exec:` provider (`exec: python script.py`)

- **Arguments:** script args, then `prompt`, then `JSON(options)`, then `JSON(context)` (https://www.promptfoo.dev/docs/providers/custom-script/).
- **Process model:** one `child_process.execFile` **per call** ([tarball: `src/providers/scriptCompletion.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz)).
- **Output:** trimmed, ANSI-stripped stdout becomes `output`, even when it is JSON. Non-empty stderr with empty stdout, or a non-zero exit, counts as an error (same file). It **cannot** return `guardrails`, `tokenUsage`, `cost` or `metadata` (custom-script docs; source).
- **Cache key:** script hash + prompt + options, without vars (source).
- **Cost of a cold process per call [measured]:** `import litellm` alone takes 6.2 s and 215 MB RSS in the backend venv. `cost_service.py` imports litellm, and `protected_prompt_service.py` imports `cost_service`.

### 1d. JavaScript custom provider (`file://provider.mjs|.js|.ts`)

- **Interface:** a class with `id()` and `callApi(prompt, context, options)`. The constructor is optional and receives `options.id`/`options.config`. It returns a `ProviderResponse` (`output`, `error`, `tokenUsage`, `cost`, `cached`, `guardrails`, `metadata`, ...). CJS, ESM and TS are supported (https://www.promptfoo.dev/docs/providers/custom-api/).
- **Typing:** `ApiProvider.callApi: (prompt: string, context?: CallApiContextParams, options?: CallApiOptionsParams) => Promise<ProviderResponse>`. `options` carries `abortSignal`. Optional `cleanup()` exists ([tarball: `dist/src/index.d.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz)).
- **Fit:** it runs inside the Node process. To reach Python code it would have to spawn Python or call HTTP itself, so it adds nothing over 1a or 1b here (custom-api docs only show `fetch`).

### 1e. Comparison for "route each test prompt through a Python function in this codebase"

| | Python `file://` | HTTP | `exec:` | JS |
|---|---|---|---|---|
| Calls `execute_protected` directly | yes, in-process import | indirectly, via the web API | yes, but cold start per call | no, needs a bridge |
| Per-call startup cost | once per worker | none | full interpreter + imports every call (~6 s, litellm) | n/a |
| Rich result (`tokenUsage`, `cost`, `guardrails`, `metadata`) | yes | yes, via `transformResponse` | no, stdout only | yes |
| Per-prompt UUID idempotency key | trivial (`uuid` in Python) | not native (see 1b) | possible in the script | possible |
| Concurrency control | `workers` (one call per worker) | `-j` | `-j` | `-j` |
| Main risks | memory: each worker imports the backend; global state per worker | 30 s router limit; needs auth for a service user; loads the web dyno | very slow; argv-sized prompts | double bridge |

### 1f. Recommendation (item 1)

Use the **Python provider**. Point it at a small module in the backend (for example `backend/app/red_team/promptfoo_target.py`) that exposes `call_api(prompt, options, context)`.

What the function does:
- Reads `mode` (`raw` or `protected`), run id, integration, model and identity from `options['config']`. The worker writes these into the generated config.
- Calls `ProtectedPromptService.execute_protected(user, payload, {'source': 'red_team', 'key': <uuid>, ...})` or the raw provider path.
- Returns `output`, `error`, `tokenUsage`, `cost` and `metadata` (decision, run ids). When policy blocks, it also returns `guardrails={'flagged': True, 'flaggedInput'|'flaggedOutput': True, 'reason': ...}`.

Why:
- It is the only option that runs the real Python pipeline in-process without HTTP limits.
- It returns every field the report needs.
- It lets the worker write progress to Mongo for each test case.

Rules that follow from the findings:
1. **Set `config.workers` explicitly** (1–2). Otherwise it follows `-j`, and every worker imports the backend (~215 MB+ for litellm alone).
2. **Set `PROMPTFOO_CACHE_ENABLED=false`** in the child environment so every test case executes (§4).
3. **Put `backend/` on `PYTHONPATH`** and set `PROMPTFOO_PYTHON` to the worker's own `sys.executable`. Both go in the subprocess environment, because provider `env:` does not reach Python.
4. **Derive the idempotency key deterministically** rather than with a random `uuid4`. For example: `uuid5(NS, f"{run_id}:{context['testIdx']}:{context.get('repeatIndex',0)}:{sha256(prompt)}")`.
   - `execute_protected` requires a UUID string and compares a fingerprint of the request.
   - promptfoo retries custom providers when the error text contains "429", "rate limit" or "too many requests" (https://www.promptfoo.dev/docs/configuration/rate-limits/). A retry then reuses the same key, while different turns of a multi-turn test case get different keys.
5. Use synchronous code (pymongo), or accept that `asyncio.run` creates a new loop on every call.
6. Log to stderr, never stdout.

If the worker dyno must stay at 512 MB, use a **thin provider** instead. It imports nothing heavy and forwards each call to the already-running worker process over a local socket or localhost HTTP. That costs more code but avoids a second backend import (§5).

---

## 2. Programmatic use (Node API)

**Documented**
- `import promptfoo from 'promptfoo'`. Requires Node.js 22.22.0+, and "Node.js 24 LTS is recommended" (https://www.promptfoo.dev/docs/usage/node-package/).
- `const evalRecord = await promptfoo.evaluate(testSuite, options)` returns an `Eval` record. Call `await evalRecord.toEvaluateSummary()` for the serializable summary (node-package page; https://www.promptfoo.dev/docs/usage/node-api-reference/).
- The API reference lists `redteam.generate(config)` and `redteam.run(config)`, and labels `redteam.*` **Experimental (may change)**. `evaluate`, `loadApiProvider(s)`, assertions, cache and guardrails are labelled Stable (node-api-reference). The node-package page does not mention red-team functions at all.

**Actual 0.126.0 signatures** (from `dist/src/index.d.ts`, [tarball](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz)):

```ts
export declare function evaluate(testSuite: EvaluateTestSuite, options?: EvaluateOptions): Promise<Eval>;
declare function doGenerateRedteam(options: Partial<RedteamCliGenerateOptions>): Promise<Partial<UnifiedConfig> | null>;
type LibraryRedteamRunOptions = Omit<RedteamRunOptions, 'eventSource'>;
declare function runRedteam(options?: LibraryRedteamRunOptions): Promise<Eval | undefined>;
// default export: { assertions, cache, evaluate, getModelPricing, guardrails, loadApiProvider, loadApiProviders,
//   redteam: { Extractors, Graders, Plugins, Strategies, Base: {Plugin, Grader}, generate: doGenerateRedteam, run: runRedteam } }
```

**Option types**
- **`EvaluateOptions`:** `cache`, `delay`, `generateSuggestions`, `suggestionsCount`, `interactiveProviders`, `maxConcurrency`, `progressCallback(completed, total, index, evalStep, metrics)`, `repeat`, `showProgressBar`, `timeoutMs`, `maxEvalTimeMs`, `isRedteam`, `silent`, `filterRange`, plus `abortSignal` (same `.d.ts`).
- **`EvaluateTestSuite`:** `{prompts, providers, writeLatestResults?, author?}` plus the rest of `TestSuiteConfig`, which includes `tests`, `defaultTest`, `redteam`, `sharing`, `env` and **`outputPath`** (same `.d.ts`).
- **`RedteamRunOptions`:** `id`, `config` (path), `target`, `output`, `cache`, `envPath`, `maxConcurrency`, `delay`, `remote`, `force`, `filterPrompts`, `filterProviders`, `filterTargets`, `verbose`, `progressBar`, `description`, `tags`, `strict`, `liveRedteamConfig` (an in-memory config object, written to a temp YAML), `logCallback(message)`, `progressCallback(completed, total, index, evalStep, metrics)`, `abortSignal` and `loadedFromCloud` (same `.d.ts`; [tarball: `src/redteam/shared.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz)).

**Where docs and code disagree** ([tarball: `src/evaluate.ts`, `src/node/evaluate.ts`, `src/evaluator/engine.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz))
- The API reference lists `outputPath`, `onTestComplete`, `formatOutput` and `nunjucksFilters` in `EvaluateOptions`. The code reads **`testSuite.outputPath`** and reports progress through **`progressCallback`**. No code path reads `options.outputPath` or `onTestComplete`.
- The JSDoc says the library `maxConcurrency` defaults to 10, but the evaluator uses `options.maxConcurrency || 4`.

**Library vs CLI behaviour** (all calls pass `eventSource`; [tarball: `src/node/doEval.ts`, `src/redteam/shared.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz))
- Library calls (`eventSource: 'library'`) do **not** install SIGINT/SIGTERM handlers and do **not** set `process.exitCode`.
- `redteam.run` still writes the eval to the SQLite DB (`write: true`) and pings the promptfoo API health URL first. A failed health check only logs a warning.

### Recommendation (item 2)

Run the **CLI as a subprocess** from the Python worker, using a pinned local install (§5). Use two steps:

```
<repo>/node_modules/.bin/promptfoo redteam generate -c <run>/promptfooconfig.yaml -o <run>/redteam.yaml --no-progress-bar
<repo>/node_modules/.bin/promptfoo redteam eval -c <run>/redteam.yaml -o <run>/results.jsonl -o <run>/results.json --no-table --no-progress-bar -j <N>
```

Why the CLI:
- Red-team generate/run **is** available programmatically, but only from JavaScript. It is experimental, and its documented types don't match the shipped ones.
- Calling it from Python would mean keeping a Node wrapper script. Its only gains are `progressCallback`/`abortSignal`/`logCallback`, and the Python provider (§1f) or the JSONL stream (§4) can supply progress anyway.

Why two steps instead of `redteam run`:
- It separates "generation failed" from "scan failed".
- It avoids an `-o` quirk in `redteam run`. There, `-o` is documented as the path for the *generated tests*, and the code passes the same path to the eval as its output file ([tarball: `src/redteam/commands/run.ts`, `src/redteam/shared.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz)).
- `redteam eval` behaves exactly like `eval` and defaults to `redteam.yaml` (https://www.promptfoo.dev/docs/usage/command-line/).

Fallback: if live progress or in-process cancellation proves necessary, a ~40-line `runner.mjs` that calls `promptfoo.redteam.run({config, progressCallback, abortSignal, logCallback})` and prints JSON lines is feasible. Pin the version exactly, because the API is experimental.

---

## 3. Output format

**Formats.** `-o` supports `.json`, `.jsonl`, `.csv`, `.yaml`/`.yml`/`.txt`, `.html`, `.xml` and `.junit.xml`, and several `-o` flags can be given at once (https://www.promptfoo.dev/docs/configuration/outputs/; [tarball: `src/util/output.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz) `writeOutput`; **[measured]** two `-o` flags wrote both files).

**JSON file (`OutputFile`)**
- Top-level keys: `evalId`, `results` (`EvaluateSummaryV3`), `config` (redacted), `shareableUrl`, `metadata` (`promptfooVersion`, `nodeVersion`, `platform`, `arch`, `exportedAt`, `evaluationCreatedAt`, `author?`), `vars?`, `runtimeOptions?`, `traces?` and `blobAssets?` ([tarball: `src/util/output.ts` `createOutputData`; `dist/src/index.d.ts` `OutputFile`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz)).
- **[measured]** A real file had keys `['evalId','results','config','shareableUrl','metadata','vars','runtimeOptions']`.
- The outputs doc shows an older example with `results.outputs`/`providers`. The 0.126.0 type and the real file use `results.results` instead (outputs page vs measured).

**`EvaluateSummaryV3`:** `{version: 3, timestamp, results: EvaluateResult[], prompts: CompletedPrompt[], stats: EvaluateStats, repeatStability?}`. `CompletedPrompt` has `id`, `raw`, `label`, `provider` and `metrics` (`score`, `testPassCount`, `testFailCount`, `testErrorCount`, `assertPassCount`, `assertFailCount`, `totalLatencyMs`, `tokenUsage`, `cost`, ...) ([tarball `index.d.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz)).

**`EvaluateStats`:** `successes`, `failures`, `errors`, `tokenUsage` (`prompt`, `completion`, `cached`, `total`, `numRequests`, `completionDetails`, `assertions`, and `attacker` for test prompt generation usage), `durationMs?`, `generationDurationMs?`, `evaluationDurationMs?` and `cacheHits?` (same file; **[measured]**).

**`EvaluateResult`** (one per test × prompt × provider). Fields from the 0.126.0 `.d.ts`, which **[measured]** output matched:

| field | meaning |
|---|---|
| `id`, `promptIdx`, `testIdx`, `promptId`, `description?` | identity |
| `testCase` | the full atomic test (`vars`, `metadata`, `assert`, `options`) |
| `provider` | `{id, label}` |
| `prompt` | `{raw, label, config}` |
| `vars` | rendered vars |
| `response?` | `ProviderResponse` (`output`, `tokenUsage`, `cost`, `cached`, `metadata`, `guardrails`, `error`, `prompt`, `sessionId`, ...) |
| `success`, `score` | overall pass/score (in red teaming, a failed verdict means the model failed the case; grading semantics are in the companion research) |
| `gradingResult?` | `{pass, score, reason, namedScores?, tokensUsed?, componentResults?: GradingResult[], assertion?, comment?, metadata?: {pluginId?, strategyId?, graderError?, renderedGradingPrompt?, ...}}` |
| `namedScores` | per-metric scores |
| `error?`, `failureReason` | `failureReason` is the enum `ResultFailureReason {NONE: 0, ASSERT: 1, ERROR: 2}` |
| `latencyMs`, `cost?`, `incurredCost?`, `tokenUsage?` | measurements |
| `metadata?` | `testCase.metadata` merged with `response.metadata` (**[measured]**) |
| `evaluationId?`, `traceId?`, `repeatIndex?`, `repeatGroupId?` | tracing and repeat runs |

**Red-team `testCase.metadata`.** At generation, promptfoo adds `pluginId`, `pluginConfig`, `severity`, `modifiers` and `language` to each test ([tarball: generation code in `main.js`, `addLanguageToPluginMetadata`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz)). Strategies add `strategyId` (python docs), and some plugins/strategies add `goal` (source). Meanings belong to the companion research.

**JSONL**
- Each line is one `EvaluateResult`, with the same keys as above (**[measured]**). The outputs doc recommends JSONL for large evals and says `gradingResult` may be `null` (outputs page).
- **Streaming (useful):** JSONL rows are appended **as each result finishes**, during the eval ([tarball: `src/evaluator/engine.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz), `fileWriters ... writer.write(row)`). At the end the file is rewritten through a temp file and `rename`, so a reader that tails it must reopen by path ([tarball: `src/util/output.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz)).
- **[measured]** 4 rows were already on disk 4.5 s into a 20-test run with 1 s calls and 2 workers.

**`promptfoo export`:** `promptfoo export eval <evalId> [-o file] [--include-media]` exports a stored eval from the local DB (stdout by default). `promptfoo export logs [-n] [-o]` exports logs (https://www.promptfoo.dev/docs/usage/command-line/). This needs the SQLite DB, so it is only useful inside the same dyno session.

---

## 4. Running headless on a server

**Environment variables** (set them in the env of the `subprocess` that runs promptfoo)

| Variable | Effect / default | Source |
|---|---|---|
| `PROMPTFOO_CONFIG_DIR` | eval-history dir; default `~/.promptfoo`. Holds `promptfoo.db`, `promptfoo.yaml` (anonymous `id`), `evalLastWritten`, `logs/`, `cache/` | https://www.promptfoo.dev/docs/usage/command-line/; [tarball `src/database/index.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz); **[measured]** |
| `PROMPTFOO_CACHE_ENABLED` | default `true`; `false` disables all response caching | https://www.promptfoo.dev/docs/configuration/caching/ |
| `PROMPTFOO_CACHE_TYPE` / `PROMPTFOO_CACHE_PATH` / `PROMPTFOO_CACHE_TTL` | `disk` (or `memory`) / `<config dir>/cache` / 14 days | caching page |
| `PROMPTFOO_DISABLE_UPDATE` | stops the npm-registry update check; it is also set automatically when `CI` is defined | https://www.promptfoo.dev/docs/configuration/telemetry/; [tarball `src/main.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz) |
| `PROMPTFOO_DISABLE_TELEMETRY=1` | disables usage telemetry | telemetry page |
| `PROMPTFOO_DISABLE_SHARING=true` | blocks uploads. Sharing is on by default only when logged in to Promptfoo Cloud | https://www.promptfoo.dev/docs/usage/sharing/; [tarball `src/util/sharing.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz) |
| `LOG_LEVEL` | default `info`; `debug` = verbose (same as `--verbose`) | command-line page; [tarball `src/logger.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz) |
| `PROMPTFOO_LOG_TO_STDERR=true` | sends all log levels to stderr (undocumented) | [tarball `src/logger.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz) |
| `PROMPTFOO_LOG_DIR`, `PROMPTFOO_DISABLE_DEBUG_LOG`, `PROMPTFOO_DISABLE_ERROR_LOG` | log files are written per run (**[measured]**: one debug and one error log per run) | command-line page |
| `FORCE_COLOR=0` | no ANSI colours | command-line page |
| `PROMPTFOO_PYTHON`, `PROMPTFOO_PYTHON_WORKERS`, `REQUEST_TIMEOUT_MS` | Python interpreter, worker count, per-call timeout | python docs |
| `PROMPTFOO_EVAL_TIMEOUT_MS`, `PROMPTFOO_MAX_EVAL_TIME_MS` | per-test timeout and total eval time limit; timed-out tests are marked as errors | command-line and troubleshooting pages |
| `PROMPTFOO_DISABLE_WAL_MODE=true` | silences WAL warnings on odd filesystems | [tarball `src/database/index.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz) |
| `CI=true` | turns on the plain-text CI progress reporter (below) and skips the update check | [tarball `src/progress/ciProgressReporter.ts`, `src/main.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz) |

Note on `PROMPTFOO_SELF_HOSTED`: it also turns telemetry off, but it changes other behaviour too (for example, OS env vars are not available in templates) (command-line page). Not recommended here.

**Flags:** `--no-write`, `--no-table`, `--no-progress-bar`, `--no-cache`, `-j/--max-concurrency`, `--delay`, `--verbose`, `--env-file`, `--no-share`, `--filter-*`, `--resume`, `--retry-errors` and `-o` (https://www.promptfoo.dev/docs/usage/command-line/).

**SQLite and `--no-write`**
- Every CLI start runs DB migrations, so `promptfoo.db` is created even with `--no-write` ([tarball `src/main.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz)).
- The DB uses `@libsql/client` (not better-sqlite3) (npm deps).
- `--no-write` keeps the eval in memory only ([tarball `src/node/doEval.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz)). Troubleshooting docs advise against it for big evals ("We need to write to disk to avoid memory issues") (https://www.promptfoo.dev/docs/usage/troubleshooting/).
- `redteam run` always writes (`write: true`) ([tarball `src/redteam/shared.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz)).
- Recommendation: give each run its own config dir, for example `PROMPTFOO_CONFIG_DIR=/tmp/promptfoo/<run_id>`, keep writes on, and delete the dir afterwards.

**Cache gotcha**
- In `redteam run`, `--no-cache` disables caching only for the *generation* step. The eval step is called with `cache: true`, and the evaluator then uses the global setting from `PROMPTFOO_CACHE_ENABLED` ([tarball `src/redteam/shared.ts`, `src/evaluator/engine.ts`, `src/cache.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz)). This is a source reading, not tested at runtime.
- With the two-step flow, `redteam eval --no-cache` works like `eval --no-cache`.
- Either way, **set `PROMPTFOO_CACHE_ENABLED=false`** so cached target answers never stand in for a real `execute_protected` call (§1a).

**Exit codes**

| Situation | Exit | Evidence |
|---|---|---|
| all tests pass | 0 | **[measured]** |
| ≥1 failed test, or pass rate < `PROMPTFOO_PASS_RATE_THRESHOLD` (default 100) | **100** (`PROMPTFOO_FAILED_TEST_EXIT_CODE` overrides) | command-line page; **[measured]** 100, threshold 40 → 0, override 0 → 0 |
| other errors | 1 | command-line page |
| `redteam run` / `redteam eval` | same logic, because both go through `doEval` with `eventSource: 'cli'`. So **a run with any failed test case exits 100** | [tarball `src/node/doEval.ts`, `src/redteam/commands/run.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz) |
| target returned non-retryable HTTP 401/403/404/501 | scan aborted, exit = failed-test code | same |
| SIGINT once (with DB writes on) | evaluation **paused** and results saved; prints `Resume with: promptfoo eval --resume <id>`; **exit 0** | **[measured]**; [tarball `src/node/doEval.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz) |
| SIGINT twice, or 10 s after the first | `process.exit(130)` | same source |
| SIGTERM | provider cleanup + OTEL flush capped at 3 s, then re-raises SIGTERM → **143** | **[measured]** exit 143 after 0.14 s; [tarball `src/node/doEval.ts` `terminateOnSigterm`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz) |

What this means for the worker:
- Treat exit codes 0 and 100 as "scan completed" and read the result files.
- Treat any other code as a failure.
- Exit 0 after a single SIGINT does *not* mean the scan completed, so cancel with **SIGTERM** (exit 143). Start promptfoo in its own process group (`start_new_session=True`) and signal the group.
- **[measured]** After SIGTERM, Python provider workers lingered about 1 s until their in-flight call returned, then exited when stdin closed.
- With `--no-write`, no SIGINT handler is installed, so Node's default handling applies (source).

**Concurrency and rate limiting**
- CLI `-j` defaults to 4 ([tarball `src/node/doEval.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz)).
- `--delay <ms>` > 0 **forces concurrency 1** (log line "Running at concurrency=1 because ...") (same source; the rate-limits doc only says to combine `maxConcurrency: 1` with `delay`).
- A provider-level `delay` (`ProviderOptions.delay`, defaulting to `PROMPTFOO_DELAY_MS`) sleeps after each non-cached call ([tarball `src/evaluator/runEval.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz)).
- An adaptive scheduler halves concurrency on rate limits and respects `retry-after`. Custom providers are retried when the error contains "429", "rate limit" or "too many requests". Related env vars: `PROMPTFOO_REQUEST_BACKOFF_MS` (5000), `PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER`, `PROMPTFOO_MIN_CONCURRENCY` and `PROMPTFOO_SCHEDULER_QUEUE_TIMEOUT_MS` (https://www.promptfoo.dev/docs/configuration/rate-limits/).
- Generation concurrency is set separately with `redteam.maxConcurrency` (default 4) and `redteam.delay` (https://www.promptfoo.dev/docs/red-team/configuration/).

**Live progress**, in order of usefulness for this app:
1. The app's own `call_api` can count or record each test case in Mongo as it happens. This is exact and needs nothing from promptfoo.
2. Tail the streamed JSONL (§3). It has one line per finished test, including grading.
3. With `CI=true`, stdout shows `[Evaluation] Starting N test cases...`, milestone lines at 25/50/75% (for example `✓ 50% complete (5/10)`), periodic updates every 30 s, and `[Evaluation] ✓ Complete! x/y tests in t` ([tarball `src/progress/ciProgressReporter.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz); **[measured]**). The interactive progress bar is drawn only on a TTY (`process.stderr.isTTY`) (same source).
4. The library `progressCallback` (§2).

`redteam run` also logs `Generating test cases...` and `Running scan...` ([tarball `src/redteam/shared.ts`](https://registry.npmjs.org/promptfoo/-/promptfoo-0.126.0.tgz)).

---

## 5. Installation footprint

**Package and install size**
- **Package alone:** 34.4 MB unpacked (npm `dist.unpackedSize`). It has 74 dependencies and 22 optional dependencies (`npm view`).
- **Full install [measured]** (`npm install promptfoo@0.126.0 --ignore-scripts`, Linux x64):
  - 579 packages.
  - `node_modules` is **698 MB on disk** (562 MB apparent), and about **130 MB as gzip**, roughly what it adds to a compressed slug.
  - The install took 1.5 min.
  - Largest folders: `node-sql-parser` 89 MB, `@azure` 65 MB, `pdfjs-dist` 37 MB, `promptfoo` 35 MB, `openai` 35 MB, `wordnet-db` 34 MB, `@napi-rs` 30 MB, `@img` (sharp) 28 MB, `@libsql` 20 MB.
- **`--omit=optional` [measured]:** 369 packages, 243 MB. But it **drops the `@libsql/linux-x64-*` native binaries the SQLite DB needs**, so it is not usable as is.
- The troubleshooting page treats `Cannot find module '@libsql/<platform>'` as a packaging problem fixed with `npm install --include=optional` (https://www.promptfoo.dev/docs/usage/troubleshooting/).

**Native modules [measured]**
- Native `.node` files present: `@libsql/linux-x64-gnu` and `-musl` (required, for the DB), `@img/sharp-linux-x64` (optional), and `@napi-rs/canvas-linux-x64-gnu` (optional).
- `tsx`/esbuild also ship platform binaries.
- **better-sqlite3 is not a dependency in 0.126.0.**
- All of these come as prebuilt per-platform optional packages, so no compiler is needed on Linux x64.

**Memory [measured]**, Node 24.14.1:
- `promptfoo --version`: ~315 MiB max RSS, 1.65 s wall time.
- A 200-test eval with a Python provider (`-j 2`): Node peaked at **~318 MiB RSS**, with Node plus 2 Python workers at ~360 MiB.
- `--max-old-space-size=192` still peaked at ~299 MiB. Most of the footprint is the loaded bundle, not results.
- Backend imports that a Python provider worker would load: `import litellm` 215 MiB and 6.2 s; `import guardrails` 121 MiB; `fastapi+pymongo+pika+httpx` 59 MiB. All figures are max RSS from GNU `time`, in KiB/1024.
- Troubleshooting docs only describe raising the heap (`NODE_OPTIONS=--max-old-space-size=8192`) and the `PROMPTFOO_STRIP_*` variables for large evals (troubleshooting page).

**npx vs local dependency**
- Docs show `npx promptfoo@latest`, global installs, and `npm install promptfoo --save` for library use. They don't recommend either for production (https://www.promptfoo.dev/docs/installation/; https://www.promptfoo.dev/docs/integrations/ci-cd/).
- On a server, `npx` downloads at runtime into an npm cache that is ephemeral on Heroku and lets the version drift.
- The PyPI wrapper `promptfoo` (0.2.0) also runs `npx promptfoo@latest` unless `PROMPTFOO_VERSION` is set (https://pypi.org/project/promptfoo/).
- **Recommended:** a root `package.json` with `"promptfoo": "0.126.0"` (exact pin) plus a committed `package-lock.json`, installed at build time with `npm ci`. Call `node_modules/.bin/promptfoo` by absolute path.

---

## 6. Heroku

**Current repo facts.**
- The root `Procfile` defines `web`, `worker`, `dispatcher` and `recovery`, all as `cd backend && ...`.
- Root `requirements.txt` contains `-r backend/requirements.txt`.
- Root `.python-version` is `3.12`.
- Root `.slugignore` removes `Frontend/`, `docs/`, `backend/tests/`, `.venv`, and so on.
- Netlify builds from `Frontend` (`netlify.toml`), so a root `package.json` does not affect Netlify.

**Buildpacks (Cedar, classic)**
- Commands: `heroku buildpacks:set heroku/python -a <app>` then `heroku buildpacks:add --index 1 heroku/nodejs -a <app>`, giving the order **nodejs, then python** (https://devcenter.heroku.com/articles/using-multiple-buildpacks-for-an-app).
- Rule: "Always put the buildpack for the primary language of your app as the last buildpack". "The last buildpack in the list gets used to determine the process types". The explicit root `Procfile` still defines the processes (same page).

**Node buildpack**
- Detection: used when `package.json` is "in the root directory" (https://devcenter.heroku.com/articles/nodejs-behavior-in-heroku).
- Install: with `package-lock.json`, Heroku runs `npm ci` (https://devcenter.heroku.com/articles/nodejs-classic-buildpack-builds).
- devDependencies: installed, then pruned (same page).
- Build scripts: a `build` script runs, or `heroku-postbuild` instead (same page). Keep the root `package.json` free of scripts.
- `node_modules` is cached between builds (same page).
- Node version: set with `engines.node`. Unset means **26.x** as of 2026-11. Supported: 26.x Active LTS; 24.x and 22.x Maintenance LTS (EOL 2028-04-30 / 2027-04-30) (https://devcenter.heroku.com/articles/nodejs-support).
- Pin `"engines": {"node": "24.x"}`. That satisfies promptfoo's `>=22.22.0`, matches its "Node 24 LTS recommended" line (https://www.promptfoo.dev/docs/installation/), and is the version measured here.
- Runtime PATH: `node`/`npm` are on PATH at runtime and for later buildpacks, and the classic buildpack also adds `node_modules/.bin` (nodejs-behavior page).

**Python buildpack**
- Detection: `requirements.txt`, `poetry.lock` or `uv.lock` "in its root directory" (https://devcenter.heroku.com/articles/python-behavior-in-heroku).
- Version: set in `.python-version` at the root. 3.12 is supported (security fixes only upstream, EOL Oct 2028) (https://devcenter.heroku.com/articles/python-support).

**Code in a subdirectory.** Both buildpacks look only at the root, and the current layout already handles this:
- The root `requirements.txt` forwards to `backend/` (pip `-r`).
- The new root `package.json`/`package-lock.json` install `node_modules/` at the repo root.
- The Procfile `cd backend` affects only the working directory. The worker should therefore resolve promptfoo as `<repo root>/node_modules/.bin/promptfoo` (for example `Path(__file__).resolve().parents[k]`) rather than rely on the relative PATH entry.

**Slug size**
- The Dev Center now says "The default maximum allowed slug size (after compression) is **1000 MB**". Support can raise it to 2000 MB (https://devcenter.heroku.com/articles/limits, updated Oct 14 2026; https://devcenter.heroku.com/articles/slug-compiler, updated Mar 30 2026). This replaces the older 500 MB figure.
- Build limits: 25 min and ~12 GB memory for slug compilation (limits page).
- promptfoo adds about 130 MB compressed (§5), plus the Node runtime.

**`.slugignore`**
- Applied "after you push code to Heroku and before the buildpack runs". Syntax is roughly `.gitignore`, but negation with `!` is not supported (slug-compiler page).
- It cannot remove anything `npm ci` installs, because those files are created after it runs. To slim `node_modules`, a `heroku-cleanup` script could delete optional packages, but that is uncertain and not tested.
- The page applies to classic buildpacks only.

**Dyno memory**
- Eco, Basic and Standard-1X have **512 MB**. Standard-2X has 1 GB, and Performance-M 2.5 GB (https://devcenter.heroku.com/articles/dyno-types).
- R15 (forced restart) happens at 1 GB for 512 MB dynos and 2 GB for Standard-2X, "two times its quota". Before that the dyno swaps (https://devcenter.heroku.com/articles/dyno-memory-behavior).
- **[measured]** estimate for the worker dyno: Node ~315 MiB + the existing Python worker + ≥1 promptfoo Python provider worker that imports the backend (~215 MB+ for litellm alone). That is well above 512 MB.

**Ephemeral filesystem**
- "Any files written get discarded the moment the dyno stops or restarts", and files are not visible to other dynos (https://devcenter.heroku.com/articles/dynos).
- So `~/.promptfoo/promptfoo.db`, the cache and the result files exist only for that dyno's lifetime.
- The worker must read the result JSON/JSONL and write everything to MongoDB before exiting. `promptfoo view`, `export` and `--resume` are not usable across restarts.

**Shutdown**
- On restart or deploy, SIGTERM goes "to all processes in the dyno". After 30 s the dyno manager sends SIGKILL (R12) (https://devcenter.heroku.com/articles/dyno-shutdown-behavior).
- So the Python worker, Node and the Python provider workers all receive SIGTERM together. Node exits within ≤3 s (§4). The worker should mark the run interrupted and requeue it, which fits the existing `recovery` process.

**Fir / Cloud Native Buildpacks (2026)**
- Fir is GA only in **Fir Private Spaces**. Common Runtime on Fir is "To Be Added", so a normal app stays on Cedar (https://devcenter.heroku.com/articles/generations, updated Sep 11 2026).
- Fir uses CNBs only, and classic buildpacks are unsupported there (same page). Cedar can opt into CNBs with the `cnb` stack (https://devcenter.heroku.com/articles/using-multiple-buildpacks-for-an-app).
- With CNBs, Node+Python is configured in `project.toml` with groups `heroku/nodejs`, `heroku/python` and then **`heroku/procfile`**, which is required when a Procfile exists (same page).
- On Fir, dynos restart at 100% of memory quota, with no 2× grace (https://devcenter.heroku.com/articles/limits).
- The OCI image limit is 5 GB (limits page).

### Recommendation (item 6)

Stay on Cedar with classic buildpacks:
```
heroku buildpacks:set heroku/python
heroku buildpacks:add --index 1 heroku/nodejs
```

**Package files.** Add a root `package.json` and the `package-lock.json` produced on Linux by `npm install`:
```json
{"private": true, "engines": {"node": "24.x"}, "dependencies": {"promptfoo": "0.126.0"}}
```
Leave out the `scripts` block.

**Worker process environment** (set by the worker when it spawns promptfoo, or as config vars):
- `PROMPTFOO_CONFIG_DIR=/tmp/promptfoo/<run_id>`
- `PROMPTFOO_CACHE_ENABLED=false`
- `PROMPTFOO_DISABLE_TELEMETRY=1`
- `PROMPTFOO_DISABLE_UPDATE=1`
- `PROMPTFOO_DISABLE_SHARING=true`
- `FORCE_COLOR=0`
- `CI=true`
- `PROMPTFOO_PYTHON=<sys.executable>`
- `PYTHONPATH=<repo>/backend`

**Dyno size.** Run the `worker` dyno on at least **Standard-2X (1 GB)**, with `workers: 1` in the provider. Use Performance-M if more provider workers are needed. Alternatively keep 512 MB and switch to the thin callback provider (§1f).

**Persistence.** Persist everything to MongoDB, and never read promptfoo's local DB after the process exits.

---

## 7. Uncertain / could not verify

1. **`redteam run -o` reuse.** The same path is used for the generated tests and for the eval output (§2). This comes from reading the source; it was not run, because generation needs access to the hosted service or a generation model.
2. **`redteam run --no-cache` and the eval phase.** That the eval phase still caches is a source reading (§4), not tested.
3. **Exit code after one SIGINT.** It was measured as 0 for `promptfoo eval`. It was not measured for `redteam run`/`redteam eval`.
4. **Memory on Heroku.** The figures were measured on a desktop (Node 24.14.1, x64). RSS includes shared pages, and Heroku's accounting and Node 26 may differ. The memory of a provider worker that imports the full backend was inferred from import measurements (litellm and guardrails), not measured end to end.
5. **Install size on Heroku.** It was measured with `--ignore-scripts`. Heroku's `npm ci` runs install scripts, which could add files (for example sharp/canvas downloads). The slug's real compressed size was not measured.
6. **npm lockfile platforms.** It is not verified whether a lockfile generated on macOS or Windows records the Linux `@libsql/linux-x64-gnu` optional package. Known npm optional-dependency lockfile issues exist, so generate the lockfile on Linux.
7. **Absolute vs relative PATH.** Whether Heroku's `node_modules/.bin` PATH entry is absolute (it would then survive `cd backend`) is not documented. Use an absolute path.
8. **`.slugignore` on Fir/CNB.** Its behaviour there, and `project.toml` `exclude`, are not confirmed by Heroku docs. Only a third-party tutorial covers `[io.buildpacks] exclude`.
9. **Retry counts disagree between pages.** The HTTP page says `maxRetries` defaults to 4; the rate-limits page says "retried up to 3 times by default".
10. **Library `maxConcurrency` default.** The JSDoc says 10 and the code uses 4. Documented `EvaluateOptions.outputPath`/`onTestComplete` have no code path; use `testSuite.outputPath`/`progressCallback`.
11. **`--fail-on-error` flag.** The CI/CD page mentions it, but the CLI reference does not list it. Not verified.
12. **Docs vs types for the experimental API.** `redteam.generate/run` types on the API reference page (`RedteamGenerateConfig`, `RedteamRunConfig`) don't match the shipped `.d.ts` (`Partial<RedteamCliGenerateOptions>`, `LibraryRedteamRunOptions`). The API is marked Experimental.
13. **Network calls during red teaming.** `redteam run` makes a health-check call to the promptfoo API. Whether generation or the health check can be fully offline belongs to the companion research.
14. **Grading of `guardrails.flagged`.** How red-team graders score a guardrail-flagged response (a block via the `guardrails` field) is out of scope here and belongs to the companion research.
15. **Heroku slug limit change.** The 500 MB → 1000 MB change is stated on two Dev Center pages (2026). The date of the change was not found.
