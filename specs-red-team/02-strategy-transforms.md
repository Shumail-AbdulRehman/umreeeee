# Spec 02 — Strategy transforms and reply decoders

**Status:** Done
**Depends on:** Spec 00
**Model:** Standard — `claude-sonnet-5-5` · `gpt-6.1-sol` · `gemini-3.8-flash`
**Issue:** —
**Owns:** `backend/app/red_team/strategies.py`, `backend/tests/unit/test_red_team_strategies.py`, `specs-red-team/inventory/02-strategy-transforms.md`
**Reuses:** `backend/app/red_team/evaluators.py`, `ARCHITECTURE.md#invariants`

## Goal

Pure, deterministic functions that disguise an attack prompt for each of the eight strategies, and that produce the decoded variants of a model reply so leaked markers cannot hide behind an encoding.

## Scope

- `apply(strategy_id, prompt, seed_material)`: returns the text to send. `basic` returns the prompt unchanged. `base64`, `hex`, `rot13` encode the attack and wrap it in a short instruction to decode and follow it. `leetspeak` substitutes a fixed character map. `roleplay`, `hypothetical` and `authority` wrap the attack in one of a few fixed frames chosen deterministically from `seed_material` (no randomness without the seed).
- `decoded_variants(text)`: returns the original reply plus every decoding that can be derived from it: base64 and hex runs (only runs long enough to be meaningful, valid UTF-8 output, bounded total size), ROT13 of the whole reply, and a leetspeak-normalised form. Output order is deterministic and duplicates are removed.
- `normalize(text)`: the comparison form used by graders (Unicode NFKC, casefold, collapsed whitespace), matching the legacy `evaluators.normalized` behaviour so v2 and v3 compare the same way.
- Every function is pure: no I/O, clock or global random state. Input size is bounded (24,000 characters, the platform prompt limit); oversize input raises a clear error.

## Explicit non-scope

- Deciding verdicts from decoded variants → spec 11.
- Choosing which strategies a test uses or building rows → spec 10.
- Strategy display names and effort metadata (data) → spec 01.

## Reuse first

- Copy the normalisation semantics of `evaluators.normalized` exactly rather than inventing a second policy; reference it in the docstring.
- Standard library only (`base64`, `binascii`, `codecs`, `unicodedata`).

## Steps

1. Write the transforms and decoders with bounded work.
2. Write round-trip and edge-case unit tests.

## Done when

- [x] `.venv/bin/python -m pytest -q tests/unit/test_red_team_strategies.py` passes: each encoding strategy's output contains no plaintext attack words yet decodes back to the original attack; framing strategies contain the original attack verbatim and choose the same frame for the same seed material; `apply` with an unknown strategy raises. [unit]
- [x] Decoder tests prove a marker hidden in base64, hex, ROT13 or leetspeak inside an otherwise normal reply appears in `decoded_variants`; invalid base64, odd-length hex and binary garbage produce no variant and never raise; a 24,001-character input raises. [unit]
- [x] `.venv/bin/python -m pytest -q tests/unit` passes with 0 failures; count in the Log. [unit]
- [x] `.venv/bin/python -m compileall -q app scripts` exits 0. [static]

## Log

- **2026-11-11**: Implemented `strategies.py` and tests. `tests/unit/test_red_team_strategies.py` 24 passed; `tests/unit` 354 passed (0 failures); `compileall -q app scripts` exit 0. Done-when bullets 1-4 all verified in this session. Leetspeak map: a/e/i/o/s/t to 4/3/1/0/5/7 (upper and lower). Framing seed: sha256(str(seed_material)) mod 3 frames per strategy.
