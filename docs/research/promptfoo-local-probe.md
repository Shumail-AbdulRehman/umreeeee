# promptfoo hands-on probe

Run by Claude on 2026-11-22 with promptfoo 0.126.0 (npm), Node v24.14.1, in a scratch folder outside the repo.
Target: a `file://target.py` Python provider calling Groq `openai/gpt-oss-20b` directly. Generator and grader:
`groq:openai/gpt-oss-120b`. Plugins `prompt-extraction`, `hijacking`; strategy `base64`; `numTests: 1`.

## Install footprint

| Install | node_modules size |
| --- | --- |
| `npm install promptfoo@0.126.0` | 669 MB (578 packages) |
| `npm install --omit=optional promptfoo@0.126.0` | 253 MB |

The largest packages in the full install were node-sql-parser (89 MB), @azure (65 MB), pdfjs-dist (37 MB), promptfoo itself
(35 MB), openai (35 MB), wordnet-db (34 MB), @img/sharp (28 MB), @opentelemetry (26 MB) and @anthropic-ai (26 MB).
Native modules: @libsql, sharp. Heroku's compressed slug limit is 500 MB, so the full install is not viable next to the
Python backend. The `--omit=optional` install must be proven to run red-team generation before it is relied on.

## Behaviour observed

1. **With `PROMPTFOO_DISABLE_REMOTE_GENERATION=true`:**
   - `hijacking` refused outright: "hijacking plugin requires remote generation, which has been explicitly disabled …
     point at a self-hosted endpoint with PROMPTFOO_REMOTE_GENERATION_URL or use Promptfoo Cloud".
   - `prompt-extraction` attempted local generation and failed: "groq:openai/gpt-oss-120b returned a refusal during
     inference for PromptExtractionPlugin test case generation. User-configured values were included in inference and
     may have been deemed harmful".
   - Result: 0 test cases, the scan was skipped, and the process **exited 0** (unless `--strict` is passed).
2. **With remote generation enabled (default):** the CLI stopped at an interactive prompt: "Email Verification Required —
   Red team scans require email verification to continue. ? Work email:". It exited 1 when stdin was closed.
   A headless server therefore needs a pre-verified account or token configured before any scan.
3. Data and logs were written under `PROMPTFOO_CONFIG_DIR` (`logs/promptfoo-error-*.log`, `promptfoo-debug-*.log`).

## Consequences for the plan

- Local-only generation with an aligned model (Groq gpt-oss) does not produce attacks for these plugins. Either promptfoo's
  hosted generation (verified email/account) or an unaligned self-hosted generator is required.
- The worker must treat "0 tests generated" as a failure even though the CLI exits 0, i.e. use `--strict` and/or check the
  generated test count.
- The size of promptfoo's dependencies is a Heroku deployment risk; it needs a dedicated check.
