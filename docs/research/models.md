# Spec dispatch model metadata

Verified 2026-11-04 against primary provider model pages. These headers describe future spec dispatch tiers; they do not change application integrations or override the current agent model.

- https://platform.claude.com/docs/en/models/overview confirms claude-opus-5-5, claude-sonnet-5-5 and claude-haiku-5-5 API IDs.
- https://developers.openai.com/api/docs/models is the official current catalog checked for gpt-6-astra, gpt-6.1-sol and gpt-6-luna.
- https://aistudio.google.com/docs/models confirms gemini-3.8-flash and gemini-3.5-flash-lite. Use its listed gemini-4-argon as the Heavy Google candidate, replacing the older preview candidate in the skill table. This is metadata only, not an application model selection.

Heavy: claude-opus-5-5 / gpt-6-astra / gemini-4-argon.
Standard: claude-sonnet-5-5 / gpt-6.1-sol / gemini-3.8-flash.
Light: claude-haiku-5-5 / gpt-6-luna / gemini-3.5-flash-lite.

Reused unchanged for specs-red-team on 2026-11-11 (one week after verification); re-check the IDs if dispatch fails.
