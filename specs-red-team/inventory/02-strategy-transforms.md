# Inventory fragment: spec 02 strategy transforms

### strategies-module
`backend/app/red_team/strategies.py` — pure (stdlib only) strategy transforms and reply decoders. `apply(strategy_id, prompt, seed_material='')`, `decoded_variants(text)`, `normalize(text)`, `StrategyError(ValueError)`, `STRATEGY_IDS`, limits `MAX_INPUT_CHARS=24000`, `MIN_RUN_CHARS=16`, `MAX_RUNS_PER_KIND=20`, `MAX_TOTAL_VARIANT_CHARS=48000`. Oversize input or unknown strategy raises `StrategyError`. **Added by:** spec 02.

How later specs use it:
- Spec 10: `apply(strategy_id, filled_template_prompt, seed_material)` builds the sent text; use a stable seed such as `f"{seed}:{plugin_id}:{template_id}"` so the frame is reproducible. Encoding strategies wrap the whole prompt in a short decode-and-follow instruction (`basic` is unchanged). The grader still needs the ORIGINAL marker, not the encoded one.
- Spec 11: grade with `any(normalize(marker) in normalize(v) for v in decoded_variants(reply))`. `decoded_variants` returns `[reply, base64 runs, hex runs (spaces/colons allowed between bytes), whole-reply ROT13, leetspeak-reversed casefolded reply]`, deduplicated; only runs of 16+ chars, valid printable UTF-8. ROT13 and leet variants transform the whole reply, so compare by substring on the normalised form. The leet variant maps 4,3,1,0,5,7 to a,e,i,o,s,t and so also rewrites real digits in a marker; always test the raw reply and the other variants too.
- Spec 20: `normalize` is the same policy as `evaluators.normalized` (replicated, not imported).
**Added by:** spec 02.
