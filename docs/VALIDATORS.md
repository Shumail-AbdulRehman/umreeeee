# Phase 2 validator implementation

The ordinary prompt route evaluates active, applicable policies before the provider call and again before releasing output. Input checks see the user prompt and the administrator-owned system instruction as separate fields. A BLOCK match wins; any incomplete validation with no BLOCK fails closed. Output text is never stored or returned when output validation blocks or fails.

## Installed API and behavior

- `guardrails-ai==0.11.0`: deterministic checks use a registered local custom `Validator` with `PassResult`/`FailResult` through its `validate` API. The application decides BLOCK, LOG, and ALERT; Guardrails does not repair, reask, or call a model. Its metrics, tracing, and remote inference settings are disabled before construction.
- `regex==2026.9.10`: patterns have a 25 ms timeout. A timeout is an error, never a pass.
- `phonenumbers==9.0.39`: only valid numbers in the configured default region (`PII_PHONE_REGION=US`) or international form match. Email uses a bounded pattern; credit cards require Luhn. Deterministic PII confidence is 0.99 for validated matches, not a calibrated probability.
- `transformers==4.57.6`, `torch==2.8.0+cpu`, `sentencepiece==0.2.1`: optional local classifiers. Weights load at startup from `VALIDATOR_MODEL_CACHE_DIR` with `local_files_only=True`. No request triggers a download. Default revisions are pinned in `.env.example`; changing them requires re-evaluation.

| Type | Model or method | Revision | Ready rule |
|---|---|---|---|
| keyword | Unicode casefold substring or bounded whole-word regex | `phase2-deterministic-1` | Always |
| regex | `regex` with 25 ms timeout | `phase2-deterministic-1` | Always |
| pii | Email, phone parser, Luhn | `phase2-deterministic-1` | Always |
| prompt_injection | [ProtectAI DeBERTa v2](https://huggingface.co/protectai/deberta-v3-base-prompt-injection-v2) | `90c9989b1a342275dd0d1a95aad283c04e075671` | Weights and tokenizer load and warm locally |
| toxicity | [Unitary toxic-bert](https://huggingface.co/unitary/toxic-bert) | `4d6c22e74ba2fdd26bc4f7238f50766b045a0d94` | Weights and tokenizer load and warm locally |

The injection model card maps class 1 to injection. It explicitly says it does not detect jailbreak attacks reliably and may flag system prompts. The toxicity model uses the six listed harmful labels and its model card warns that Hugging Face inference may differ from Detoxify. Neither score is a calibrated safety probability. Both models are English-oriented and may miss context or novel attacks. Model card licenses are Apache 2.0; read the cards before redistributing weights.

The registry inspects the complete text in overlapping token windows, at most 32 windows. It refuses text that exceeds its bound. At most 50 policies/500 rules apply per run. The default stage budget is 5 seconds. If a validator fails, times out, or is unavailable, the stage is incomplete and content is withheld. Semantic inference is limited to two concurrent calls, with at most 50 waiting evaluations; a waiting request has a bounded timeout. This implementation measures elapsed inference and fails closed after the budget, but a blocked native inference call can occupy a worker beyond that budget. A separate terminating worker process is still needed for a hard wall-clock guarantee.

Administrators cannot activate policies whose validator is unavailable. If weights disappear after activation, affected runs fail closed and `/api/ready` reports unavailable until repaired or disabled. The app remains accessible for corrective administration. The capabilities API shows per-validator readiness and reason.

To download the pinned models before startup, install the optional ML requirements and run:

```sh
.venv/bin/pip install 'torch==2.8.0' --index-url https://download.pytorch.org/whl/cpu
.venv/bin/pip install -r requirements-ml.txt
.venv/bin/python -c 'from huggingface_hub import snapshot_download; from app.core import config; snapshot_download(config.INJECTION_MODEL_ID, revision=config.INJECTION_MODEL_REVISION, cache_dir=config.VALIDATOR_MODEL_CACHE_DIR); snapshot_download(config.TOXICITY_MODEL_ID, revision=config.TOXICITY_MODEL_REVISION, cache_dir=config.VALIDATOR_MODEL_CACHE_DIR)'
```

There is no live-provider smoke test in routine verification. The [Gemini API](https://ai.google.dev/api/generate-content) confirms a distinct `systemInstruction` field; the [Anthropic Messages API](https://platform.claude.com/docs/en/api/messages/create) and [Ollama chat API](https://docs.ollama.com/api/chat) confirm the other transport shapes. Provider calls use bounded, non-following HTTP with a 2 MB response cap and no automatic retry.
