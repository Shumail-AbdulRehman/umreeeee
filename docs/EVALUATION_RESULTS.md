# Phase 2 evaluation — 24 September 2026

These are local measurements, not claims about general security accuracy or production performance. The 100 input examples and 20 separate output examples in `backend/tests/fixtures/enforcement_cases.json` are original synthetic text (`synthetic-2026-09-24-v2`); no external dataset was adapted. A separate 10-example `backend/tests/fixtures/tuning_cases.json` is reserved for future tuning and was not scored in this report. The threshold of 0.8 was fixed before this evaluation; there was no threshold optimization on the reported cases. A larger, independently sourced and reviewed test set is needed before treating any rates as representative.

## Detector results

Run: `cd backend && .venv/bin/python -m scripts.evaluate_guardrails` with the required application keys and the pinned weights in `VALIDATOR_MODEL_CACHE_DIR`. The input evaluation ran each detector over all 100 cases. Positive labels were PII for the PII detector, direct injection plus jailbreak for the injection detector, and harmful content for toxicity. The output evaluation used the toxicity detector on 10 safe and 10 harmful response texts. All results below used local CPU inference, not a provider.

| Detector, input stage | TP | FN | FP | TN | Precision | Recall | Accuracy | Mean/check |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| PII | 20 | 0 | 0 | 80 | 100% | 100% | 100% | 0.191 ms |
| Prompt injection | 36 | 4 | 3 | 57 | 92.3% | 90% | 93% | 163.409 ms |
| Toxicity | 12 | 8 | 0 | 80 | 100% | 60% | 92% | 48.855 ms |

Injection caught 20/20 direct-injection prompts and 16/20 jailbreak prompts, with 3 false positives among 20 PII prompts and none among 20 compliant controls. Toxicity caught 12/20 harmful input prompts and missed 8. On the separate output examples, toxicity matched 8/10 harmful responses, missed 2, and matched 0/10 safe responses. There were no validation errors in this sequential evaluation. Perfect results on 20 compliant controls do **not** imply a universal zero false-positive rate. These models are English-oriented, and neither score is a calibrated probability. In particular, the injection model card warns about jailbreak and system-instruction limitations. The toxicity model uses Hugging Face inference, which its card says can differ from Detoxify.

Pinned revisions: ProtectAI injection `90c9989b1a342275dd0d1a95aad283c04e075671`, Unitary toxicity `4d6c22e74ba2fdd26bc4f7238f50766b045a0d94`. Library versions and model/setup details are in [VALIDATORS.md](VALIDATORS.md).

## Latency and load

Machine reported 8 logical CPUs. The nearest-rank p50/p95/p99 values are in milliseconds. The target in the Phase 2 plan is **p95 enforcement latency at 50 concurrent users below 200 ms**. Every row submitted 50 requests in a burst after warm-up; it is not a sustained-duration soak test. Provider network time and actual billing were excluded.

The database-backed mock-provider test (`python -m tests.benchmarks.benchmark_phase2`) used one input keyword LOG policy, a roughly 40-word prompt, and a no-delay fake provider. It measured the full protected run including local MongoDB transactions as well as validator-only and recorded enforcement timings.

| Concurrent | Full run p50/p95/p99 | Recorded enforcement p50/p95/p99 | Validator-only p50/p95/p99 | Errors |
|---:|---|---|---|---:|
| 1 | 12.08 / 17.24 / 20.67 | 0.055 / 0.125 / 0.232 | 0.007 / 0.014 / 0.055 | 0 |
| 10 | 77.82 / 94.66 / 101.14 | 0.068 / 0.141 / 0.226 | 0.016 / 0.032 / 0.068 | 0 |
| 50 | 231.59 / 344.49 / 361.23 | 0.062 / 0.117 / 0.164 | 0.014 / 0.031 / 0.041 | 0 |

The separate warmed semantic validator-only check (`python -m tests.benchmarks.benchmark_semantic`) used a 100-character harmless input and one injection rule, two inference slots, at most 50 waiters, a 5-second validator budget, and PyTorch limited to four intra-op CPU threads. No provider or database was involved.

| Concurrent | p50/p95/p99, including safe timeout responses | Validation errors | Result |
|---:|---|---:|---|
| 1 | 155.50 / 167.10 / 180.79 | 0/50 | p95 below 200 ms |
| 10 | 332.96 / 5000.32 / 5001.16 | 8/50 | deadline misses |
| 50 | 4548.08 / 5001.05 / 5188.52 | 22/50 | target not met |

At high CPU concurrency the system fails closed: it does not release an unchecked response or silently change the rule to a heuristic. The queue improved behavior over immediate overload rejection, but did not make the 50-user target. More capable inference hardware, batch/process isolation, and a separate load test under deployment-like limits are needed before claiming the semantic NFR. Native inference is not forcibly terminated on a hard wall-clock deadline; a stuck native call could hold a slot after its result is marked timed out. This remains a known runtime limitation. No live-provider smoke test was performed because no user-provided credentials were available.

## Functional verification

With a disposable single-node MongoDB replica set, the full backend suite passed after Phase 2 changes. Browser verification against a synthetic organization and fake Ollama endpoint showed a matching keyword BLOCK persisted a run/violation and made **zero** provider calls; an allowed prompt made one provider call and returned its safe result. At 390 px, the Phase 2 navigation/pages (Insights, Prompt Studio, Activity, Violations, Catalog, Latency, Spend) showed no document-level horizontal overflow or page error. Frontend lint and production build passed. No real application database, real provider, real user prompt, or production deployment was used.
