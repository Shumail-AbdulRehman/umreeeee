# Intake — Red Team on promptfoo

| # | Question | Answer (verbatim where given) |
| --- | --- | --- |
| 1 | Option A (external promptfoo) or B (promptfoo inside the app)? | "go with the option B the big one" |
| 2 | Keep the custom engine? | "rmve ou cusyome logic" — remove the custom attack/grading/scoring logic |
| 3 | Design? | "make sure the deisgn is good and beautiful and not look ai generated". Budget constraint (80% of weekly limit used): Claude proposed reusing the approved `design/red-team/v3` screens instead of a new three-stage design pass; the owner replied "and continue". |
| 4 | Who implements? | "the impkentation of those specs will be done by codex so amke the specs detailed" — Codex `gpt-6.2-sol`. |
| 5 | Local-only generation or promptfoo hosted generation (verified email account)? | "just go woth the full pomptfoo one" — hosted generation. |
| 6 | Deployment | Fixed by the repo: Heroku backend (root Procfile: web, worker, dispatcher, recovery), Netlify frontend, MongoDB Atlas, RabbitMQ. |
