# Intake — Red Team on promptfoo

| # | Question | Answer (verbatim where given) |
| --- | --- | --- |
| 1 | Option A (external promptfoo) or B (promptfoo inside the app)? | "go with the option B the big one" |
| 2 | Keep the custom engine? | "rmve ou cusyome logic" — remove the custom logic for test cases, grading, and scoring |
| 3 | Design? | "make sure the deisgn is good and beautiful and not look ai generated". Budget constraint (80% of weekly limit used): Claude proposed reusing the approved `design/red-team/v3` screens instead of a new three-stage design pass; the owner replied "and continue". |
| 4 | Who implements? | "the impkentation of those specs will be done by codex so amke the specs detailed" — Codex `gpt-6.2-sol`. |
| 5 | Local-only generation or promptfoo hosted generation (verified email account)? | "just go woth the full pomptfoo one" — hosted generation. |
| 6 | Deployment | Fixed by the repo: Heroku backend (root Procfile: web, worker, dispatcher, recovery), Netlify frontend, MongoDB Atlas, RabbitMQ. |
| 7 | Reuse existing code? (2026-11-22) | "redeisgn teh spec so it used this code and not impkent it from carthc using promptfoo" — the scheduler at `/home/shumail/Downloads/scheduler_umr/scheduler_umr`; "i have permision of it". See `docs/research/scheduler-reuse.md`. |
| 8 | Required flow (supervisor, 2026-11-22) | "user ui say ik redteam config generate karay ga jesay promptfoo support karta hy using our ui us conf ko use kartay huway ham promptfoo redteam runnkarain gay aur phr jo results atay uski json han apnay style main convert kar ui pay dekhain gay" — UI builds a promptfoo-style config, run `promptfoo redteam run`, convert the JSON to our format, show it in the UI. |
| 9 | Protected-mode routing | "Small bridge, protected only" — raw uses promptfoo's built-in provider as the scheduler does; protected forwards through a loopback bridge to the policy pipeline. |
| 10 | Generation source / done specs 02, 03, 05, 06 | "promptfoo Cloud login" (not the scheduler's company generation server); "Port scheduler, keep report shape" — port `parse_redteam_json` and `FRAMEWORKS`, keep the report payload the finished UI renders. |
