# promptfoo red-team engine: verified facts

Researched 2026-11-22 for promptfoo 0.126.0

Method: the official docs at promptfoo.dev were read live where needed. The source and the docs source
(`site/docs/**`) were read from the git tag `0.126.0` (commit `aa4e2c6`), so the code citations match the npm release
exactly. Source links are pinned to that tag. Where the docs and the code disagree, both are given and the code wins.

Abbreviations used below:
- `GH` = `https://github.com/promptfoo/promptfoo/blob/0.126.0/`
- `DOCS` = `https://www.promptfoo.dev/docs/`

## 0. Decision summary (details and sources in the sections below)

- **The defaults depend on the hosted service.** The default strategies are `basic`, `jailbreak:meta` and
  `jailbreak:composite`, and both jailbreak strategies need remote generation. The `default` plugin set includes about 30
  plugins that can only be generated remotely (`hijacking`, all unaligned `harmful:*` plugins, all `bias:*` plugins and
  others).
- **Supplying your own provider does not turn off remote plugin generation.** Remote generation is chosen when it is not
  disabled AND (`PROMPTFOO_REMOTE_GENERATION_URL` is set, OR you are logged into Cloud, OR there is no
  `OPENAI_API_KEY`/Codex login, OR `--remote` is passed). `redteam.provider` is not part of that check. So with only a
  Groq key, plugin test generation still goes to `api.promptfoo.app` unless
  `PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=true`. Iterative strategies and grading do respect `redteam.provider`.
- **An email is required, but not a Cloud account.** Unless remote generation is disabled, `redteam generate`/`run` (and
  `eval` of a redteam config) need an email in the global config that the server reports as OK. Otherwise the CLI prompts
  "Work email:" interactively, and a headless run fails. In CI (`CI=true` etc.) a placeholder email is used and the check
  is skipped. A Cloud login (`promptfoo auth login` or `PROMPTFOO_API_KEY`) only lifts limits: a local cap of 100,000
  probes per month and reduced `jailbreak:tree` parameters.
- **Disabling remote generation removes features.** Remote-only plugins return 0 tests (logged as an error). Remote-only
  strategies throw. In 0.126.0 the deprecated `jailbreak` id is routed to `jailbreak:meta`, which is remote-only. Local
  test case generation uses your `redteam.provider` model. Aligned models often refuse (see the sibling note
  `promptfoo-local-probe.md`).
- **Grading can be fully local with Groq.** Every plugin has a local grader (`promptfoo:redteam:<plugin>`) that uses
  `redteam.provider` or `defaultTest.options.provider` (or `--grader`). PASS = the target defended. FAIL = a vulnerability.
- **Risk scores are computed only by the web report UI.** They are not in the eval output. The per-plugin formula is small
  and MIT-licensed, so the app can reimplement it. Severity is stored on each test as `metadata.severity`.
- **License.** MIT. The hosted inference falls under Promptfoo's privacy policy and site terms, has usage limits, and is
  not covered by any SLA.

---

## 1. Red-team workflow and commands

The workflow has three steps: `promptfoo redteam init` → `promptfoo redteam run` → `promptfoo redteam report`. "`promptfoo
redteam run` is a shortcut that combines `redteam generate` and `redteam eval` steps" (DOCS `red-team/configuration/`
"Getting Started": https://www.promptfoo.dev/docs/red-team/configuration/).

| Command | What it does | Key flags (verified in source) |
| --- | --- | --- |
| `redteam init [directory]` | Interactive project setup that writes `promptfooconfig.yaml` (and `chat.py` for a custom provider). | `--no-gui`, `--env-file/--env-path` (GH `src/commands/redteam/init.ts` L21-24; GH `src/redteam/commands/init.ts` L221, L659) |
| `redteam setup` | Opens the browser UI on the red-team setup page. | `-p, --port` (default 15500) (https://www.promptfoo.dev/docs/usage/command-line/) |
| `redteam generate` (alias `generate redteam`) | Generates the adversarial test cases and writes them to `redteam.yaml`. | `-c, --config`, `-o, --output` (default `redteam.yaml`), `-w, --write`, `--purpose`, `--provider` (test case generation model; the help text says "Defaults to: openai:chat:gpt-5.5-2026-04-23"), `--injectVar`, `--plugins <csv>`, `--strategies <csv>`, `-n, --num-tests`, `--language`, `--no-cache`, `-j, --max-concurrency`, `--delay <ms>`, `--remote`, `--force`, `--no-progress-bar`, `--strict` ("Fail if any plugins fail to generate test cases"), `--burp-escape-json`, `-t, --target`, `-d, --description` (GH `src/redteam/commands/generate.ts` L1067-1136; https://www.promptfoo.dev/docs/usage/command-line/#promptfoo-redteam-generate) |
| `redteam run` | Runs generate and then eval. | `-c, --config`, `-o, --output` (the generated tests path, default `redteam.yaml` next to the config), `-j, --max-concurrency`, `--delay`, `--remote`, `--force`, `--strict`, `--no-cache`, `--no-progress-bar`, `--filter-prompts`, `--filter-providers/--filter-targets`, `-t, --target`, `-d, --description`, `--tag key=value` (repeatable). It has **no** `--plugins`/`--strategies`/`-n` flags; those come from the config. (GH `src/redteam/commands/run.ts` L24-74; https://www.promptfoo.dev/docs/usage/command-line/#promptfoo-redteam-run) |
| `redteam eval` | "Works the same as `promptfoo eval` … but defaults to loading `redteam.yaml`." Supports `--grader <provider>`, `-o` and the other eval flags. | https://www.promptfoo.dev/docs/usage/command-line/#promptfoo-redteam-eval; `--grader` sets `defaultTest.options.provider` (GH `src/node/doEval.ts` L812-819) |
| `redteam report [directory]` | Starts the local web UI on the red-team report. | `-p, --port` (default 15500) (https://www.promptfoo.dev/docs/usage/command-line/#promptfoo-redteam-report) |
| `redteam plugins` | Lists the plugins. | `--ids-only`, `--default` (only the default set) (GH `src/redteam/commands/plugins.ts`) |
| `redteam discover`, `redteam poison` | Target discovery agent; RAG document poisoning. `poison` always uses hosted generation. | https://www.promptfoo.dev/docs/usage/command-line/; https://www.promptfoo.dev/docs/red-team/troubleshooting/data-handling/ |

**What `redteam run` produces** (GH `src/redteam/shared.ts`, `doRedteamRun`):
1. If remote generation is enabled, a health check against `https://api.promptfoo.app/health`. On failure it only logs a
   warning.
2. Generation (`doGenerateRedteam`) writes `redteam.yaml`. This file holds the full config plus the generated `tests`,
   `defaultTest.metadata.{purpose, entities}`, and `metadata.configHash`. Because of `configHash`, generation is skipped
   when the config has not changed unless `--force` is given. It also holds `metadata.generation` (id, generatedAt,
   tokenUsage) (GH `src/redteam/commands/generate.ts` L324-336, L887-979;
   https://www.promptfoo.dev/docs/red-team/configuration/#generation-token-accounting).
3. If no test cases were generated: "No test cases generated. Skipping scan." The process exits 0 unless `--strict` is
   given (GH `src/redteam/shared.ts`). The sibling probe saw the same behaviour (`promptfoo-local-probe.md`).
4. An eval of `redteam.yaml` is run with `write: true`, which persists results to the local promptfoo DB (viewable with
   `redteam report`). The `Eval` object is returned to Node callers.
   - Observed in source, not tested: `doRedteamRun` passes `output: options.output ? [options.output] : undefined` to
     `doEval`. With `-o`, the same path therefore appears to be used both for the generated tests and for the eval
     output. For a worker, a cleaner sequence is `redteam generate -o <tests.yaml>` followed by
     `redteam eval -c <tests.yaml> -o <results.json>`. (Output formats belong to the other research note.)

Each generated test carries metadata that the app can use: `pluginId`, `pluginConfig`, `severity`, `strategyId` (for
strategies), `modifiers`, `language`, and `goal` where extracted. Its assertion type is `promptfoo:redteam:<pluginId>`
(GH `src/redteam/index.ts` L512-560, L736-738; GH `src/redteam/graders.ts` L136+).

## 2. The `redteam:` config block

Purpose: "The `redteam` section in your `promptfooconfig.yaml` file is used when generating redteam tests via `promptfoo
redteam run` or `promptfoo redteam generate`. It allows you to specify the plugins and other parameters of your red team
tests." (https://www.promptfoo.dev/docs/red-team/configuration/)

Schema (GH `src/validators/redteam.ts` L113-122, L251-333) and docs table
(https://www.promptfoo.dev/docs/red-team/configuration/#configuration-fields):

| Field | Type | Default / notes |
| --- | --- | --- |
| `plugins` | `Array<string \| {id, numTests?, severity?, config?}>` | `['default']`. Duplicates are removed (the last one wins), and the result is sorted. |
| `plugins[].severity` | `critical \| high \| medium \| low \| informational` | Overrides the default severity. It is written into each test's `metadata.severity`. |
| `plugins[].numTests` | positive int | Falls back to `redteam.numTests`, then 5. |
| `plugins[].config` | object | Common keys: `examples`, `language`, `maxCharsPerMessage`, `modifiers`, `graderGuidance`, `graderExamples`, and `excludeStrategies` (seen in source as a plugin-level exclusion). There are also plugin-specific keys (section 3). |
| `strategies` | `Array<string \| {id, config?}>` | `['default']` = `basic`, `jailbreak:meta`, `jailbreak:composite` (GH `src/redteam/constants/strategies.ts` L15). `config.plugins: [...]` limits a strategy to those plugins. |
| `numTests` | positive int | 5 per plugin (GH `src/redteam/constants/plugins.ts` L5). |
| `language` | `string \| string[]` | English. Use names or ISO 639-1 codes. A list generates tests for each language. |
| `provider` | `string \| ProviderOptions` | The test case generation model. It is also the fallback grader (section 6). Docs table: `openai:gpt-5`. Code: `REDTEAM_MODEL = 'openai:chat:gpt-5.5-2026-04-23'` (GH `src/redteam/constants/plugins.ts` L17). |
| `injectVar` | string | Inferred from the prompts. |
| `purpose` | string | Inferred from the prompts. Extraction is a remote call unless remote generation is disabled, so set it explicitly (GH `src/redteam/extraction/purpose.ts`; GH `src/redteam/index.ts` L1349-1351). |
| `entities` | `string[]` | "Names of people, brands, or organizations related to your LLM application." If omitted they are extracted, remotely when remote generation is on. Set `[]` to skip (GH `src/redteam/index.ts` L1358-1360). |
| `testGenerationInstructions` | string | Extra guidance applied to all plugins. |
| `maxConcurrency` | int | Generation concurrency, default 4 (`REDTEAM_DEFAULTS.MAX_CONCURRENCY`), capped at 20 (`MAX_MAX_CONCURRENCY`) (GH `src/redteam/index.ts` L187, L1015-1018). |
| `delay` | int ms | 0. A value above 0 forces concurrency to 1. |
| `frameworks` | `string[]` of framework ids | All frameworks by default. It filters which frameworks appear in the report and CLI. |
| `contexts` | `[{id, purpose?, vars?}]` | One test set per app state. |
| `maxCharsPerMessage` | int | Caps generated user messages. |
| `graderExamples` | `[{output, pass, score, reason}]` | Global grader examples, merged before the plugin-level ones. |
| `excludeTargetOutputFromAgenticAttackGeneration`, `tracing` | bool / object | Advanced options. |

The docs' "Basic Configuration" example, verbatim (https://www.promptfoo.dev/docs/red-team/configuration/#basic-configuration):

```yaml
redteam:
  numTests: 10
  plugins:
    - 'harmful:hate'
    - 'competitors'
  strategies:
    - 'jailbreak'
  language: ['en', 'es', 'fr'] # Test in English, Spanish, and French
```

Two of the ids in that example need remote generation in 0.126.0: `competitors` is remote-only, and `jailbreak` now
maps to `jailbreak:meta`. Below is a minimal config that runs locally, **composed by us from documented fields**. It is
not copied from the docs.

```yaml
targets:
  - id: file://target.py          # or https / openai-compatible target
    label: app-under-test
redteam:
  purpose: 'Customer-support bot for ACME; must not reveal system prompt or other users’ data.'
  entities: []
  provider: groq:openai/gpt-oss-120b     # generation + grading fallback
  numTests: 3
  plugins:
    - prompt-extraction
    - id: policy
      severity: high
      config:
        policy: 'Never disclose another customer’s order details.'
  strategies:
    - basic
    - base64
```

## 3. Plugins

Source of truth: GH `src/redteam/constants/plugins.ts` (lists, collections, remote-only ids) and GH
`src/redteam/constants/metadata.ts` L510-669 (`riskCategorySeverityMap`, the default severity) and L670-838
(`riskCategories`, the report grouping). The docs link to the same severity map
(https://www.promptfoo.dev/docs/red-team/configuration/#severity-levels).

Legend: **R** = remote-only. With `PROMPTFOO_DISABLE_*REMOTE_GENERATION` set it logs an error and returns 0 tests. This
covers `REMOTE_ONLY_PLUGIN_IDS` (GH `src/redteam/constants/plugins.ts` L490-525), the unaligned `harmful:*` plugins and
`bias:*` (GH `src/redteam/plugins/index.ts` L578-650). **D** = a dataset plugin. It needs no generation model and takes
no strategies; some need `HF_TOKEN`. Unmarked plugins have a local generator, which uses `redteam.provider`.

Severity is the default from `riskCategorySeverityMap`. C = critical, H = high, M = medium, L = low.

### Security & Access Control
`ascii-smuggling` L **R** · `bfla` H **R** · `bola` H **R** · `cca` H **R** · `debug-access` H · `model-identification` M **R** ·
`hijacking` H **R** · `indirect-prompt-injection` H **R** · `rbac` H · `reasoning-dos` L **R** · `shell-injection` H ·
`special-token-injection` M **R** · `sql-injection` H · `ssrf` H **R** · `system-prompt-override` H **R** · `tool-discovery` L ·
`mcp` H **R** · `cross-session-leak` M · `data-exfil` H **R** · `divergent-repetition` M · `harmful:privacy` H ·
`insurance:data-disclosure` C **R** · `insurance:phi-disclosure` C **R** · `pii:api-db` H · `pii:direct` H · `pii:session` H ·
`pii:social` H (collection `pii` = H) · `prompt-extraction` M · `rag-document-exfiltration` M **R** · `rag-poisoning` M **R** ·
`rag-source-attribution` H **R** · `agentic:memory-poisoning` H **R**

### Compliance & Legal
`contracts` M · `coppa` H **R** · `ferpa` M **R** · `harmful:chemical-biological-weapons` H **R** · `harmful:copyright-violations` L **R** ·
`harmful:cybercrime:malicious-code` L **R** · `harmful:cybercrime` L **R** · `harmful:illegal-activities` M **R** ·
`harmful:illegal-drugs:meth` L **R** · `harmful:illegal-drugs` M **R** · `harmful:indiscriminate-weapons` M **R** ·
`harmful:intellectual-property` M · `harmful:non-violent-crime` M **R** · `harmful:sex-crime` H **R** ·
`harmful:specialized-advice` M **R** · `harmful:unsafe-practices` L **R** · `harmful:violent-crime` H **R** · `harmful:weapons:ied` L **R** ·
`insurance:coverage-discrimination` C **R** · `insurance:network-misinformation` H **R**

### Trust & Safety
`bias:age` L **R** · `bias:disability` L **R** · `bias:gender` L **R** · `bias:race` L **R** · `harmful:child-exploitation` C **R** ·
`harmful:graphic-content` M **R** · `harmful:harassment-bullying` L **R** · `harmful:hate` C **R** · `harmful:insults` L **R** ·
`harmful:profanity` L **R** · `harmful:radicalization` L **R** · `harmful:self-harm` C **R** · `harmful:sexual-content` M **R** ·
`teen-safety:harmful-body-ideals` L · `teen-safety:dangerous-content` L · `teen-safety:dangerous-roleplay` L ·
`teen-safety:age-restricted-goods-and-services` L · `wordplay` L **R**

### Brand
`competitors` L **R** · `excessive-agency` M · `goal-misalignment` L **R** · `hallucination` M ·
`harmful:misinformation-disinformation` M **R** · `hijacking` H **R** · `imitation` L · `intent` H · `off-topic` M **R** ·
`overreliance` L · `policy` H · `politics` L · `religion` L **R** · `unverifiable-claims` M

### Domain-specific risks (all **R**)
- `ecommerce:*`: `pci-dss` C, `compliance-bypass` H, `order-fraud` H, `price-manipulation` H.
- `financial:*`: `calculation-error` L, `compliance-violation` M, `confidential-disclosure` H, `counterfactual` M,
  `data-leakage` M, `defamation` M, `hallucination` L, `impartiality` M, `japan-fiea-suitability` H, `misconduct` H,
  `sox-compliance` H, `sycophancy` L.
- `medical:*`: `hallucination` C, `anchoring-bias` H, `fda:ai-disclosure` H, `fda:cyber-access-control` C,
  `fda:cyber-audit-tampering` C, `incorrect-knowledge` C, `off-label-use` H, `prioritization-error` H, `sycophancy` M.
- `pharmacy:*`: `controlled-substance-compliance` H, `dosage-calculation` C, `drug-interaction` C.
- `telecom:*`: C for `cpni-disclosure`, `location-disclosure`, `account-takeover`, `e911-misinformation`. H for
  `tcpa-violation`, `unauthorized-changes`, `fraud-enablement`, `porting-misinformation`. M for `billing-misinformation`,
  `coverage-misinformation`, `law-enforcement-request-handling`, `accessibility-violation`.
- `realestate:*`: C for `fair-housing-discrimination`, `steering`, `lending-discrimination`. H for
  `discriminatory-listings`, `valuation-bias`, `accessibility-discrimination`, `advertising-discrimination`,
  `source-of-income`.

### Coding Agent Security (all H, all **R**)
`coding-agent:repo-prompt-injection`, `terminal-output-injection`, `secret-env-read`, `secret-file-read`,
`sandbox-read-escape`, `sandbox-write-escape`, `network-egress-bypass`, `procfs-credential-read`, `delayed-ci-exfil`,
`generated-vulnerability`, `automation-poisoning`, `steganographic-exfil`, `verifier-sabotage`. Collections:
`coding-agent:core`, `coding-agent:all` (GH `src/redteam/constants/codingAgents.ts`).

### Datasets (all **D**)
`aegis` M, `beavertails` L, `cyberseceval` M, `donotanswer` M, `harmbench` M, `toxic-chat` M, `pliny` M, `unsafebench` M,
`vlguard` M, `vlsu` M, `xstest` L. Per the docs, "Some plugins (beavertails, unsafebench, aegis) require HuggingFace
datasets that need authentication": `HF_TOKEN` (https://www.promptfoo.dev/docs/red-team/configuration/#plugin-configuration).

### Plugins that require or accept extra config
| Plugin | Config | Source |
| --- | --- | --- |
| `policy` | **Required**: `config.policy` (a string or `{id, text}`). Repeat the plugin for several policies. | GH `src/redteam/plugins/index.ts` L556-560; https://www.promptfoo.dev/docs/red-team/plugins/policy/ |
| `intent` | **Required**: `config.intent` (a string, a list, or a list of lists for multi-turn). The intents are used verbatim, never generated remotely. | GH `src/redteam/plugins/index.ts` L550; https://www.promptfoo.dev/docs/red-team/plugins/intent/ |
| `indirect-prompt-injection` | **Required**: `config.indirectInjectionVar` (the prompt variable that holds untrusted content). It must be configured separately even inside a collection. | GH `src/redteam/plugins/index.ts` L697-699; https://www.promptfoo.dev/docs/red-team/plugins/indirect-prompt-injection/ |
| `rag-poisoning` | **Required**: `config.intendedResults` (a non-empty array). | GH `src/redteam/plugins/index.ts` L708-710 |
| `prompt-extraction` | Optional `config.systemPrompt` (improves grading). | https://www.promptfoo.dev/docs/red-team/plugins/prompt-extraction/ |
| `ssrf` | Optional `targetUrls`, `ssrfFailThreshold`. | https://www.promptfoo.dev/docs/red-team/plugins/ssrf/ |
| `bola` | Optional `targetSystems`. `bfla`: optional `targetIdentifiers`. | https://www.promptfoo.dev/docs/red-team/plugins/bola/, https://www.promptfoo.dev/docs/red-team/plugins/bfla/ |
| `competitors` | Optional `mentions` (default false). | https://www.promptfoo.dev/docs/red-team/plugins/competitors/ |
| `pii:direct` | Optional `name`. | https://www.promptfoo.dev/docs/red-team/plugins/pii/ |
| custom | `file://plugin.yaml` with `generator` and `grader` prompts. Needs an OpenAI key or your own provider. | https://www.promptfoo.dev/docs/red-team/configuration/#custom-plugins |

`CONFIG_REQUIRED_PLUGINS = ['intent', 'policy']`: "can't be enabled by default or included as additional" (GH
`src/redteam/constants/plugins.ts` L385).

## 4. Strategies

All ids are from GH `src/redteam/constants/strategies.ts`. Remote requirements come from `STRATEGIES_REQUIRING_REMOTE`
(L202-213) and from each strategy's `neverGenerateRemote()` / `shouldGenerateRemote()` guard (files cited). Cost and ASR
labels come from the docs strategy table data (GH `site/docs/_shared/data/strategies.ts`, rendered at
https://www.promptfoo.dev/docs/red-team/strategies/).

**Turn model.** `MULTI_TURN_STRATEGIES = crescendo, goat, jailbreak:hydra, jailbreak:goblin, custom, mischievous-user`.
Every other strategy is single-turn. "Multi-turn strategies require a stateful application", although by default they
replay the full transcript to stateless targets (https://www.promptfoo.dev/docs/red-team/strategies/).

| Strategy id | Type | Remote? | Calls per seed test (default) | Docs cost |
| --- | --- | --- | --- | --- |
| `basic` | Static: the plugin's raw tests | Local | 1 target + 1 grade | Low |
| `base64`, `hex`, `rot13`, `leetspeak`, `homoglyph`, `arabic-presentation-forms` | Static encodings | Local | 1 target + 1 grade (each adds a copy of every test) | Low |
| `other-encodings` (collection = `camelcase`, `morse`, `piglatin`, `emoji`) | Static | Local | 1 + 1 each | Low |
| `jailbreak-templates` (`prompt-injection` = a deprecated alias) | Static templates | Local | 1 + 1 | Low |
| `image`, `video` | Static media | Local (video uses ffmpeg locally when remote generation is disabled) | 1 + 1 | Low |
| `audio` | Static media | **Remote** (throws when disabled) | 1 + 1 | Low |
| `math-prompt`, `multilingual` (deprecated; migrated to top-level `language`) | Generation-time rewrite | Local with an explicit `redteam.provider`, otherwise remote | 1 + 1 | Medium |
| `citation`, `jailbreak:likert`, `authoritative-markup-injection`, `gcg` | Generation-time rewrite | **Remote** (throws when disabled) | 1 + 1 | Medium/High |
| `jailbreak:composite` | Generation-time rewrite, fan-out n=5 | **Remote** (throws when disabled) | 5 tests × (1 + 1) | Medium |
| `jailbreak:meta` | Iterative single-turn meta-agent | **Remote**: requires `shouldGenerateRemote()`, so it fails if `OPENAI_API_KEY` is set and you are not logged in, unless `--remote` | Up to `numIterations` (default 10, env `PROMPTFOO_NUM_JAILBREAK_ITERATIONS`) target calls, plus remote generation and judge calls each iteration | High |
| `jailbreak` | **Deprecated in 0.126.0**: logs a warning and routes to `iterative:meta` | **Remote** (same as meta) | Same as meta | High |
| `jailbreak:tree` | Iterative tree search | Local with `redteam.provider` | Up to `maxAttempts` 250 (depth 25, branching 4, width 10). When not logged into Cloud this is clamped to 30 attempts (depth 5, branching 2, width 3). | High |
| `best-of-n` | Iterative sampling | **Remote** (throws when disabled) | `nSteps` (unbounded by default) × `maxCandidatesPerStep` 1, concurrency 3 | High |
| `crescendo` | Multi-turn | Local with `redteam.provider` | `maxTurns` default 10 (code) plus up to 10 backtracks. The docs example uses 5. | High |
| `goat` | Multi-turn | **Remote** (throws when disabled) | `maxTurns` default 5 | High |
| `jailbreak:hydra`, `jailbreak:goblin` | Multi-turn | **Remote** | `maxTurns` 10, `maxBacktracks` 10 | High |
| `mischievous-user` | Multi-turn simulated user | **Remote** (uses the hosted simulated-user task) | `maxTurns` 5 | High |
| `indirect-web-pwn` | Indirect injection (web agents) | **Remote** | `maxTurns` 5 | n/a |
| `custom` / `custom:*` | Multi-turn, natural-language strategy | Local with `redteam.provider` | `maxTurns` 10 | Variable |
| `layer` | Chains steps, e.g. `steps: [base64, rot13]` | Depends on the steps | Depends on the steps | Variable |
| `retry` | Regression: re-adds previously failed tests from the local DB | Local | 1 + 1 | Low |
| `file://custom-strategy.js` | JS transform | Local | Varies | Variable |

Sources for the table:
- GH `src/redteam/strategies/index.ts` L193-206 (the `jailbreak` → meta alias) and `iterative.ts`.
- GH `src/redteam/providers/iterativeMeta.ts` L755-770, `hydra/index.ts` L78-79 and L234-240,
  `iterativeTree.ts` L111-127 and L1374-1383, `crescendo/index.ts` L93-94 and L199-203, `goat.ts` L165-169,
  `bestOfN.ts` L59-68, `mischievousUser.ts`, `indirectWebPwn.ts` L102.
- GH `src/redteam/strategies/{singleTurnComposite,citation,likert,gcg,simpleAudio,simpleVideo,mathPrompt,multilingual}.ts`
  and `constants/strategies.ts` L179-182 (composite n=5).
- https://www.promptfoo.dev/docs/red-team/strategies/meta/ ("This strategy requires Promptfoo Cloud … Set
  `PROMPTFOO_REMOTE_GENERATION_URL` or log into Promptfoo Cloud")
- https://www.promptfoo.dev/docs/red-team/strategies/hydra/
- https://www.promptfoo.dev/docs/red-team/strategies/best-of-n/
- https://www.promptfoo.dev/docs/red-team/strategies/multi-turn/

Note that the docs strategy table still marks `jailbreak` as non-remote, and
https://www.promptfoo.dev/docs/red-team/strategies/iterative/ still documents `numIterations` default 4. The legacy
local provider `promptfoo:redteam:iterative` (default 4 iterations) still exists in the code, but the `jailbreak`
strategy id no longer uses it.

"Grading" in the table means one call to the plugin's grader. Iterative strategies also call a judge on every
iteration. Every target call counts as one "probe" (https://www.promptfoo.dev/docs/red-team/troubleshooting/inference-limit/).

## 5. Frameworks and presets

**Framework ids** (`FRAMEWORK_COMPLIANCE_IDS`, shown in the report's framework compliance section): `mitre:atlas`,
`nist:ai:measure`, `owasp:api`, `owasp:llm`, `owasp:agentic`, `eu:ai-act`, `iso:42001`, `gdpr`, `dod:ai:ethics` (GH
`src/redteam/constants/strategies.ts` L2-12; https://www.promptfoo.dev/docs/red-team/configuration/#framework-filtering).

You use a framework by listing its id under `plugins:`. Sub-ids select individual items:

| Framework | Sub-ids |
| --- | --- |
| OWASP LLM | `owasp:llm:01` … `owasp:llm:10` (`03` Supply Chain maps to no plugins) |
| OWASP API | `owasp:api:01` … `owasp:api:10` |
| OWASP Agentic | `owasp:agentic:asi01` … `owasp:agentic:asi10` |
| OWASP Gen AI Red Team | `owasp:llm:redteam:{model,implementation,system,runtime}` |
| NIST AI RMF | `nist:ai:measure:1.1` … |
| MITRE ATLAS | `mitre:atlas:{ai-model-access, ai-attack-staging, collection, command-and-control, credential-access, defense-evasion, discovery, execution, exfiltration, impact, initial-access, lateral-movement, persistence, privilege-escalation, reconnaissance, resource-development}`; legacy `mitre:atlas:ml-attack-staging` |
| EU AI Act | `eu:ai-act:art5:*`, `eu:ai-act:annex3:*` |
| ISO 42001 | `iso:42001:{accountability,fairness,privacy,robustness,security,safety,transparency}` |
| GDPR | `gdpr:art{5,9,15,17,22,25,32}` |
| DoD AI Ethics | `dod:ai:ethics:01` … `05` |

Sources: GH `src/redteam/constants/frameworks.ts` (L74-980); https://www.promptfoo.dev/docs/red-team/owasp-llm-top-10/,
https://www.promptfoo.dev/docs/red-team/mitre-atlas/, https://www.promptfoo.dev/docs/red-team/owasp-agentic-ai/,
https://www.promptfoo.dev/docs/red-team/gdpr/.

**A framework preset also adds strategies.** Expanding an aliased plugin adds that mapping's `strategies` to the strategy
set. For example, `owasp:llm:01` adds `jailbreak`, `jailbreak-templates` and `jailbreak:composite`, and the two jailbreak
strategies are remote-only (GH `src/validators/redteam.ts` L456-475; mapping in GH `src/redteam/constants/frameworks.ts`
L78-82).

**Plugin collections** (`COLLECTIONS`, GH `src/redteam/constants/plugins.ts` L161-176):

| Collection | Contents |
| --- | --- |
| `default` | `contracts`, `excessive-agency`, `hallucination`, `hijacking`, `politics`, every `HARM_PLUGINS` key (all `harmful:*`), `pii:*`, `bias:*` (L443-450). Of these, only `contracts`, `excessive-agency`, `hallucination`, `politics`, `harmful:intellectual-property`, `harmful:privacy` and `pii:*` can generate locally. |
| `foundation` | `FOUNDATION_PLUGINS`, L42-87: model-level harms, datasets, bias, etc. |
| `harmful` | All `harmful:*` |
| `pii` | `pii:*` |
| `bias` | Note the alias mapping: `politics`, `religion` and `bias:*` |
| Domain collections | `medical`, `pharmacy`, `insurance`, `financial`, `ecommerce`, `telecom`, `teen-safety`, `realestate` |
| `guardrails-eval` | Guardrails evaluation set |
| Coding agent | `coding-agent:core`, `coding-agent:all` |

The source also defines the aliases `toxicity`, `misinformation`, `illegal-activity` and `tool-discovery:multi-turn` (GH
`src/redteam/constants/frameworks.ts` L1013-1081). The docs list these collections:
https://www.promptfoo.dev/docs/red-team/configuration/#plugin-collections.

**How compliance is shown in the report.** This is computed client-side in the web UI
(GH `src/app/src/pages/redteam/report/components/FrameworkComplianceUtils.ts`, `FrameworkCompliance.tsx`). For each
framework, the plugins it maps to are split into compliant, non-compliant and untested. A plugin is compliant when
`pass/total >= pluginPassRateThreshold`. The default threshold is `1.0` (GH `.../report/components/store.ts` L33), so a
single failed test makes the plugin non-compliant. A framework is compliant when it has no non-compliant plugins. The card
shows the highest severity among the non-compliant plugins and the test case failure rate, and the results can be exported
as CSV (`FrameworkCsvExporter.tsx`). `redteam.frameworks` limits which framework cards are shown.

## 6. Grading

- **The grader is chosen per plugin.** Every generated test gets assertion `promptfoo:redteam:<pluginId>`. The registry
  maps 141 such ids to grader classes, and these graders exist locally even for remote-only plugins (GH
  `src/redteam/graders.ts` L136+). `RedteamGraderBase.getResult` builds a plugin rubric (plus `graderGuidance` and
  `graderExamples`) and calls `matchesLlmRubric` (GH `src/redteam/plugins/base.ts` L540-610).
- **Refusal shortcut.** An empty output or a basic refusal is a PASS without calling an LLM: "Model refused the request"
  (GH `src/redteam/plugins/base.ts` L562-571).
- **Meaning of PASS.** "A **pass** score means that the output did not violate your application's intended behavior …
  A **fail** score means that the output deviated from your application's intended behavior."
  (https://www.promptfoo.dev/docs/red-team/troubleshooting/grading-results/) In the risk code, "failure means the attack
  succeeded" (GH `src/redteam/riskScoring.ts` L330-360). So PASS = defended and FAIL = vulnerability. Errors are
  separate from PASS and FAIL.
- **Which model grades.**
  1. Remote grading at `api.promptfoo.app/api/v1/task` with `task: 'llm-rubric'` is used when all of these hold: the
     test has no explicit grader, `redteam.provider` is not set, `defaultTest.options.provider` is not set, the config
     has a `redteam` block, and `shouldGenerateRemote()` is true (in practice, no `OPENAI_API_KEY`, or logged in, or
     `--remote`, or `PROMPTFOO_REMOTE_GENERATION_URL`) (GH `src/matchers/llmGrading.ts` L199-234; GH
     `src/redteam/plugins/base.ts` L574-588; GH `src/remoteGrading.ts`).
  2. Otherwise grading is local. The order is: an explicit provider, then `defaultTest.provider` /
     `defaultTest.options.provider`, then `redteam.provider`, then the built-in default OpenAI model
     `gpt-5.5-2026-04-23` (GH `src/redteam/providers/shared.ts` L418-458, L160; GH
     `src/redteam/providers/constants.ts` L3). The docs say "`gpt-5` by default" and are stale on the version
     (https://www.promptfoo.dev/docs/red-team/troubleshooting/grading-results/).
- **How to override the grader.**
  - `redteam.provider` ("controls both attack generation and grading").
  - `defaultTest: { options: { provider: … } }` (https://www.promptfoo.dev/docs/red-team/troubleshooting/grading-results/#overriding-the-grader).
  - `promptfoo redteam eval --grader <provider>`.
  - There is no dedicated grader env var for red-team grading. The env var only decides whether grading is remote.
- **Using Groq for generation and grading.** `redteam.provider: groq:<model>` (for example `groq:openai/gpt-oss-120b`,
  with `GROQ_API_KEY`) or an OpenAI-compatible provider `openai:chat:<model>` with `config.apiBaseUrl` and `apiKey` is
  documented and supported (https://www.promptfoo.dev/docs/red-team/configuration/#changing-the-model;
  https://www.promptfoo.dev/docs/providers/groq/; GH `src/providers/registry.ts` L944-960). Grading then runs locally on
  Groq. Generation uses Groq only for plugins with a local generator, and only if remote plugin generation is off (set
  `PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=true`). Otherwise `shouldGenerateRemote()` stays true when there is no
  `OPENAI_API_KEY`, and plugin tests are fetched from the hosted API anyway (GH `src/redteam/plugins/index.ts` L481-501;
  GH `src/redteam/remoteGeneration.ts` L168-193). Iterative and multi-turn strategies that have a local mode
  (`jailbreak:tree`, `crescendo`, `custom`) use the explicit `redteam.provider` (GH
  `src/redteam/providers/crescendo/index.ts` L199-203; GH `src/redteam/strategies/types.ts` L14-24).
- **The docs contradict each other.** https://www.promptfoo.dev/docs/red-team/troubleshooting/inference-limit/ says
  "`redteam.provider` field specifically controls how red team results are graded, not how probes are generated". The
  configuration and grading pages say it controls both. The code uses it for local generation and grading, but it does
  not stop remote plugin generation.
- **Moderation.** The extra `moderation` assertion on harmful tests (OpenAI moderation or Replicate LlamaGuard 4) is off
  by default: `PROMPTFOO_DISABLE_REDTEAM_MODERATION` defaults to true (GH `src/redteam/plugins/harmful/common.ts` L12-36).

## 7. Remote generation (critical)

**Endpoints** (GH `src/redteam/remoteGeneration.ts`):
- Task endpoint: `https://api.promptfoo.app/api/v1/task`. It can be overridden by `PROMPTFOO_REMOTE_GENERATION_URL`, or
  replaced by the Cloud API host when you are logged in (L25-48).
- Unaligned harmful generation: `https://api.promptfoo.app/api/v1/task/harmful`, overridable by
  `PROMPTFOO_UNALIGNED_INFERENCE_ENDPOINT` (L200-202).
- Health and version: `/health` and `/version` (L128-141).
- Email status: `${PROMPTFOO_CLOUD_API_URL or https://api.promptfoo.app}/api/users/status?email=…` (GH
  `src/globalConfig/accounts.ts` L196-202).
- Consent: `https://api.promptfoo.dev/consent`.
- Telemetry: `https://a.promptfoo.app` (PostHog) (GH `src/constants.ts` L43-44).

**Environment variables** (GH `src/envars.ts` L44-60, L130-157):

| Variable | Effect |
| --- | --- |
| `PROMPTFOO_DISABLE_REMOTE_GENERATION` | Disables all remote generation, including the non-redteam SimulatedUser. Superset of the next variable. |
| `PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION` | Disables red-team remote generation only (GH `src/redteam/remoteGeneration.ts` L77-95). |
| `PROMPTFOO_REMOTE_GENERATION_URL` | Points the task endpoint at a self-hosted URL and forces remote generation on. |
| `PROMPTFOO_UNALIGNED_INFERENCE_ENDPOINT` | Endpoint for harmful-content generation. |
| `PROMPTFOO_CLOUD_API_URL` | Host for the email status check. |
| `PROMPTFOO_API_KEY` | Counts as "logged into cloud" (GH `src/globalConfig/accounts.ts` L51-60). |
| `PROMPTFOO_MAX_HARMFUL_TESTS_PER_REQUEST` | Batch size for harmful-content requests. |
| `PROMPTFOO_NUM_JAILBREAK_ITERATIONS` | Default iterations for the jailbreak strategies. |
| `PROMPTFOO_CONFIG_DIR` | Location of the global config (default `~/.promptfoo/promptfoo.yaml`), which holds the email. |

**When remote is used** (`shouldGenerateRemote`, GH `src/redteam/remoteGeneration.ts` L168-193). The function returns
false if either disable flag is set. Otherwise it returns true if `PROMPTFOO_REMOTE_GENERATION_URL` is set, or if you are
logged into Cloud. Otherwise it returns true when there is no `OPENAI_API_KEY` (and no usable Codex login), or when
`--remote` was passed. Some steps check only `!neverGenerateRemote()` and are therefore remote even when
`OPENAI_API_KEY` is set:
- system-purpose extraction (GH `src/redteam/extraction/purpose.ts` L24)
- unaligned `harmful:*` and `bias:*` generation
- remote-only plugins
- `jailbreak:composite`, `citation`, `likert`, `gcg`, `audio`, `goat`, `best-of-n`, `authoritative-markup-injection`

**What stops working when remote generation is disabled.**
- Plugins (return 0 tests with an error):
  - every id in `REMOTE_ONLY_PLUGIN_IDS`: `agentic:memory-poisoning`, the coding-agent plugins, `ascii-smuggling`, `bfla`,
    `bola`, `cca`, `competitors`, `coppa`, `data-exfil`, `ferpa`, `goal-misalignment`,
    `harmful:misinformation-disinformation`, `harmful:specialized-advice`, `hijacking`, `indirect-prompt-injection`,
    `mcp`, `model-identification`, `off-topic`, `rag-document-exfiltration`, `rag-poisoning`, `rag-source-attribution`,
    `reasoning-dos`, `religion`, `special-token-injection`, `ssrf`, `system-prompt-override`, `wordplay`, and all
    `medical:*`, `financial:*`, `pharmacy:*`, `insurance:*`, `ecommerce:*`, `telecom:*`, `realestate:*` plugins
  - the unaligned harm plugins (all `harmful:*` except `harmful:intellectual-property` and `harmful:privacy`)
  - `bias:*`
  - (GH `src/redteam/constants/plugins.ts` L490-535; GH `src/redteam/plugins/index.ts` L578-680)
- Strategies (throw an error): `audio`, `citation`, `gcg`, `goat`, `indirect-web-pwn`, `jailbreak:composite`,
  `jailbreak:goblin`, `jailbreak:hydra`, `jailbreak:likert`, `jailbreak:meta`, plus `jailbreak` (alias of meta),
  `best-of-n`, `authoritative-markup-injection` and `mischievous-user` (GH `src/redteam/constants/strategies.ts`
  L202-213, plus the files in section 4).
- Still works locally, using `redteam.provider` (quality depends on that model): `basic` and all static encodings,
  `jailbreak-templates`, `math-prompt`, `multilingual`/`language`, `jailbreak:tree`, `crescendo`, `custom`, `layer`,
  `retry`; and the local-generator plugins listed in section 3.
- Docs on this: "A subset of Promptfoo plugins require remote generation through Promptfoo's API and cannot be executed
  when you provide your own LLM" (https://www.promptfoo.dev/docs/red-team/troubleshooting/inference-limit/). Also: "You
  can force 100% local generation by setting the `PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION` environment variable to
  `true`. Note that the quality of local generation depends greatly on the model that you configure, and is generally
  low for most models." (https://www.promptfoo.dev/docs/red-team/configuration/#how-attacks-are-generated)

**Email and account requirement.**
- Enforced in `redteam generate`, and therefore in `redteam run`, whenever `!neverGenerateRemote()` (GH
  `src/redteam/commands/generate.ts` L426-434).
- Enforced in `eval` / `redteam eval` when the config has `redteam.plugins` and tests (GH `src/node/doEval.ts`
  L739-752).
- Flow: with no email in the global config, the CLI prints "Email Verification Required — Red team scans require email
  verification to continue" and prompts "Work email:" interactively. It then calls `/api/users/status`. The possible
  statuses are:
  - `risky_email` / `disposable_email`: rejected
  - `exceeded_limit`: error "You have exceeded the maximum cloud inference limit"
  - `email_verification_required`: error "Check your inbox for a verification link"
  - `show_usage_warning`: a warning
  - `ok`: proceed
  - (GH `src/globalConfig/accounts.ts` L161-360)
- If the status call itself fails (network error, or the 500 ms/3 s timeout), the CLI "assume[s] it's OK" (L243-254).
- CI: if `CI`, `GITHUB_ACTIONS`, `GITLAB_CI`, etc. are set, the placeholder `ci-placeholder@promptfoo.dev` is treated as
  validated and the check is skipped (GH `src/globalConfig/accounts.ts` L22, L165-185; GH `src/envars.ts` L657-679;
  changelog entry "skip email verification API call in CI environments (#8034)"). Remote payloads send
  `getUserEmail()`, the real configured email, which would be null in that case. How the hosted API treats a null email
  is unknown.
- A headless worker can preset the email with `promptfoo config set email <addr>` (GH `src/commands/config.ts` L39-60),
  or ship a `promptfoo.yaml` in `PROMPTFOO_CONFIG_DIR`. The address must be verified once through the emailed link.
- A Cloud account (`promptfoo auth login` or `PROMPTFOO_API_KEY`) is not required. It removes the local **monthly probe
  limit of 100,000** ("Monthly probe limit reached", thrown at generate time; probes are counted from the local DB of
  red-team evals this month) (GH `src/util/redteamProbeLimit.ts` L6-78; GH `src/redteam/commands/generate.ts` L289-303;
  changelog "add monthly probe limit for non-cloud users (#7966)"). It also removes the `jailbreak:tree` clamps. The docs
  add: "Promptfoo open-source enforces usage limits based on the number of probes run … Usage limits still apply for
  locally-hosted models." (https://www.promptfoo.dev/docs/red-team/troubleshooting/inference-limit/)

**Data sent to the remote service.**
- From https://www.promptfoo.dev/docs/red-team/troubleshooting/data-handling/:
  - Generation: "Application purpose … Plugin configuration and settings … Red team target/provider setup details …
    Your email (for usage tracking)".
  - Grading: "The prompt sent to your target; Your target's response; Grading criteria".
  - Not sent: "API keys or credentials stored in local environment variables".
- In code:
  - Plugin generation body: `{config (minus graderExamples), injectVar, inputs, n, purpose, task: <pluginId>, version,
    email, targetId?}` (GH `src/redteam/plugins/index.ts` L390-410).
  - Harmful body: `{email, harmCategory, n, purpose, version, config}` (GH `src/providers/promptfoo.ts` L90-98).
  - Remote grading: `{task:'llm-rubric', rubric, output, vars, email}` (GH `src/remoteGrading.ts` L49-60).
  - Multi-turn hosted test strategies send the conversation history, including target replies.
- Domains: `api.promptfoo.app` (generation and grading), `api.promptfoo.dev` ("Consent tracking for harmful plugins"),
  `a.promptfoo.app` (telemetry) (same docs page).

**Telemetry and sharing.**
- `PROMPTFOO_DISABLE_TELEMETRY=1` disables PostHog usage events: commands, plugin and strategy ids, and assertion types.
  These events can include the user ID and email when they are present in the config
  (https://www.promptfoo.dev/docs/configuration/telemetry/; GH `src/telemetry.ts` L23, L112). The consent POST of the
  email during email validation (`telemetry.saveConsent`) does **not** check that flag (GH `src/telemetry.ts` L217-237).
- "`PROMPTFOO_DISABLE_REMOTE_GENERATION` … is not a network isolation guarantee and does not disable telemetry,
  account/license checks, sharing, Cloud sync…" (data-handling page).
- `PROMPTFOO_DISABLE_SHARING` turns sharing off. Auto-sharing is on only when `sharing.apiBaseUrl` is configured, a
  non-promptfoo share URL env var is set, or you are logged into Cloud (GH `src/share.ts` L60-80, L842;
  GH `src/util/sharing.ts` L25).
- `PROMPTFOO_DISABLE_UPDATE=1` stops the npm update check.

## 8. Risk scoring in the report

- Doc: https://www.promptfoo.dev/docs/red-team/risk-scoring/. It describes a CVSS-style 0–10 score made of four parts:
  - impact base: critical 4, high 3, medium 2, low 1
  - exploitability: 0 if ASR is 0, otherwise `min(4, 1.5 + 2.5·ASR)`
  - human factor: `base × (0.8 + 0.2·ASR)`, where base is 1.5 for low complexity, 1.0 for medium, 0.5 for high, and 0
    for tool-only
  - complexity penalty: `min(0.5, 0.1 + 0.4·ASR)` for low-complexity test cases with ASR above 0
  - Levels: ≥9 critical, ≥7 high, ≥4 medium, otherwise low.
- Code: GH `src/redteam/riskScoring.ts`.
  - `calculatePluginRiskScore(pluginId, severity, [{strategy, results}])` scores each strategy. The plugin score is the
    maximum, and the strategy that produced it is reported as `worstStrategy`.
  - Each strategy has hard-coded `humanExploitable`/`humanComplexity` metadata in the `STRATEGY_METADATA` table, for
    example `basic` low, `jailbreak:composite` medium, `goat` not human-exploitable, and `crescendo` high.
  - Severity `informational` scores 0.
  - ASR = failed tests / total for that plugin and strategy pair, using `metadata.strategyId` (default `basic`).
- **Where it is computed.** Only in the web report: `src/app/src/pages/redteam/report/components/TestSuites.tsx` is the
  only consumer. It is not stored in the eval output JSON. The eval output carries the inputs to the formula: per-test
  `success`/grading result, `metadata.pluginId`, `metadata.strategyId` and `metadata.severity`. `riskScoring` is not
  exported by the npm package (its `exports` are only `.` and `./contracts`), so the app must reimplement the formula,
  which MIT permits.
- The docs' "System-Level Risk Scoring" (maximum risk plus 0.5 per extra critical and 0.25 per extra high) has **no
  implementation** in the open-source 0.126.0 tree; no matching function was found. It is probably an Enterprise
  feature. Treat it as unverified.
- Severity sources: the defaults in `riskCategorySeverityMap` (section 3), or the per-plugin `severity` override written
  into test metadata. The report's severity cards and framework cards use these values.

## 9. License and hosted-service terms

- **promptfoo is MIT licensed.** The `LICENSE` file says "Copyright (c) Promptfoo 2025" and contains the standard MIT
  text, and `package.json` declares `"license": "MIT"` (GH `LICENSE`; GH `package.json` L6). Some crescendo files are
  derived from Microsoft PyRIT, which is also MIT (GH `src/redteam/providers/crescendo/LICENSE`). The tree also contains
  `src/external/APACHE_LICENSE` for vendored code.
- **Hosted inference.**
  - "When using Promptfoo's open-source red teaming solution, your usage falls under Promptfoo's privacy policy … these
    services have usage limits to ensure fair access" (https://www.promptfoo.dev/docs/red-team/troubleshooting/inference-limit/).
  - The privacy notice says: "If you opt-in, some features (called SimulatedUser and red team) send prompts to
    Promptfoo's servers to generate responses" (https://www.promptfoo.dev/privacy/).
  - The site Terms of Service (last updated January 24, 2025: https://www.promptfoo.dev/terms-of-service/) govern "the
    Site". They include "you will not access the Site through automated or non-human means, whether through a bot,
    script or otherwise", a right to "deny access … for any reason", and "We cannot guarantee the Site will be
    available". They also say the Site is "not tailored to comply with … HIPAA, FISMA". No API-specific terms or SLA for
    `api.promptfoo.app` were found.
- **Self-hosting.** Full air-gapped or self-hosted inference is offered only as "Promptfoo Enterprise On-Prem" (data
  handling page). No open-source server for `PROMPTFOO_REMOTE_GENERATION_URL` was found.

---

## Uncertain / could not verify

1. Whether the hosted API accepts or limits requests whose `email` is null. This matters for the CI-placeholder path
   (`CI=true` without `promptfoo config set email`).
2. The exact free usage limits of the hosted service beyond the local 100,000 probes/month counter. The
   `exceeded_limit` / `show_usage_warning` thresholds are decided server-side and are not documented.
3. Whether the site Terms of Service's ban on "automated or non-human means" is meant to apply to CLI and API use of
   `api.promptfoo.app` from a server. No API-specific terms were found.
4. Which models the hosted service uses for generation, grading and unaligned harmful content. They are not
   documented.
5. How `promptfoo redteam run -o <path>` behaves: the source passes the same path to the eval output. This was not run.
6. The docs vs code mismatches noted above:
   - default model `openai:gpt-5` (docs) vs `openai:chat:gpt-5.5-2026-04-23` (code)
   - `jailbreak` shown as local with 4 iterations (docs) vs routed to remote `jailbreak:meta` (code)
   - crescendo `maxTurns` 5 (docs example) vs 10 (code default)
   - `best-of-n` marked remote in the docs table but missing from `STRATEGIES_REQUIRING_REMOTE`; the code still throws
     when remote is disabled
7. The docs' system-level risk score (section 8) has no open-source implementation.
8. `personal-safety` and `nist:ai` appear in `ALIASED_PLUGINS` but have no entry in `ALIASED_PLUGIN_MAPPINGS`, so
   whether they expand to anything is unclear.
9. How the interactive email prompt behaves in a non-TTY, non-CI process. The sibling probe saw exit 1 when stdin was
   closed; whether it hangs under other stdin conditions was not tested.
10. Whether a free Promptfoo Cloud account (for `PROMPTFOO_API_KEY`) is available and what limits it has. Not
    researched.
