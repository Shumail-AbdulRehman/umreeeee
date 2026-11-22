# Inventory fragment: spec 14 test editor

### test-editor
`Frontend/src/features/red-team/TestEditor.jsx` — default export `TestEditor`, the full-page new/edit test form with sticky summary. Controlled only by its own local state; it never calls an API. **Added by:** spec 14.

Props: `initial` (partial v3 values, merged over defaults: protected mode, no plugins or strategies, 3 per plugin, threshold 0.8, seed 1, temperature 0.2, max_tokens 256, judge null), `capabilities` (v3 capabilities), `integrations` ([{id, account_name, provider, status, models}], non-active hidden), `users` ([{id, first_name, last_name, email, is_active}]), `fieldErrors` (server map, rendered by `FieldErrors` beside name, integration_id, model, mode, subject_user_id, plugins, strategies, tests_per_plugin, threshold_score, seed, temperature and judge), `message` (role="alert" banner), `busy` (disables all actions), `onSaveDraft(values)`, `onLaunch(values)`, `onCancel()`.

Submitted values: `{name, integration_id, model, mode, subject_user_id (null unless protected and chosen), plugins[], strategies[] (never 'basic'), tests_per_plugin, threshold_score (0-1 fraction; UI shows 50-100%), seed, temperature, max_tokens (carried from initial, default 256, no UI field), judge: {integration_id, model} | null}`. No `version` or id is included; the caller adds those.

Blocking: the launch button is disabled while `computeEditorSummary().blocking` is set or, after it, a local check fails (empty name, no integration or model, threshold outside 50-100, judge on without integration or model), or `busy`. The message is in a persistent `role="status"` element whose id is the launch button's `aria-describedby`. Save draft is only disabled by `busy` (the server validates drafts).

How spec 21 uses it: render inside the new/edit page, pass `initial` from the draft (or omit), call `createRedTeamTest`/`updateRedTeamTest` in `onSaveDraft`, and create-then-launch with the idempotency key in `onLaunch`; feed API errors back via `fieldErrors` and `message`; `onCancel` navigates back. Edit `version` handling and navigation live in spec 21.

Earlier-format drafts (`format=categories`, or legacy `attack_categories` without a format) render categories and attack count, preserve a 0–100% threshold, and submit `format`, `attack_categories`, `num_attacks` instead of the v3 plugin/strategy/judge fields. Judge call figures are estimates, with the two-attempt bound disclosed.
