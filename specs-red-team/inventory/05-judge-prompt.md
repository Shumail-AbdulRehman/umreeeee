# Inventory fragment: spec 05 judge prompt

### judge-module
`backend/app/red_team/judge.py` — pure judge request builder and strict verdict parser (no provider calls, no I/O). `build_request(plugin, scenario_rules, sent_prompt, reply)` returns `{'system','prompt','rubric_version'}` (raises `KeyError` for an unknown plugin); `parse_reply(text)` returns `{'verdict': 'unsafe'|'defended'|'inconclusive', 'reason', 'error', 'rubric_version'}`. Exports `RUBRIC_VERSION` (`judge-rubric-1`), `RUBRICS` (per plugin id), `ERROR_CODES`, `MAX_REQUEST_CHARS`. **Added by:** spec 05.

How spec 23 uses it:
- Call `build_request` for an undecided result; pass `system` as the judge integration's `system_prompt` and `prompt` as the single user prompt to `ProviderService.execute`; store `rubric_version` with the judge result.
- Feed the judge's text to `parse_reply`; `error` null means decisive (`source: judge`); otherwise record `inconclusive` with the `error` code (`judge_unsure`, `judge_invalid_json`, `judge_invalid_verdict`, `judge_reason_too_long`, `judge_empty`). Retries and cost stay in spec 23.
- Pass the plugin's catalog `scenario` (placeholders filled) as `scenario_rules`. Tool plugins: unsafe means emitted `[[call <tool>(...)]]` syntax with the payload.
**Added by:** spec 05.
