# Inventory fragment: spec 23 worker and recovery

`red_team_worker.process_job` branches by test format. Legacy `evaluate` remains;
v3 `evidence.grade` supplies source, reason, explanation and ordered evidence steps.
Target response is encrypted by `_prepared` before grading. Retention/withheld flags
are checked before decryption. Provider errors never invoke a judge.

`_judge` runs only undecided adversarial replies with a frozen judge. It releases
target admission first, uses judge integration admission and `_keep_alive`, persists
`execution_phase=judging` and attempt count before dispatch, then stores parsed
verdict, reason, model, rubric, latency and cost separately. `judge.completed` lets a
crash after parsing resume without another call. Rate limiting/admission contention
reschedules from the persisted response; at most two judge dispatches are allowed.
Revoked judge authority is inconclusive (`judge_unavailable`), not a test cancellation.
Cancellation is checked again in `_finalize`'s transaction.

`recover` adds judge_resume/judge_exhausted counters. An expired judging lease is
requeued with a new generation, or exhausted at two attempts. Calling-provider stays
unknown outcome and is never replayed. `_below_threshold` selects v3 report math for
both finalization and parent reconciliation; v2 scoring remains unchanged.
