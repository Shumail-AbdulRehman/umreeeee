# Red Team module brief

Date: 2026-11-11. Verbatim user requests, in order, from the planning conversation:

1. "now lets comeback to out project you have the red team tetsing code can you do it and complete this project"
2. (plan-project) "first analzye how will you implemnet the read team tetsing moduel only and corrcetly"
3. "the zip file i gave you te code in it is usbale"
4. (plan-project) "i have asked the guy and he gave me to use the code so its all good now i wnat you to make a deisgn firts of this module and i willsee it first"
5. (plan-project) "approve now write an impmenntation plan for it make sure its detailed"

## Interpreted brief

Upgrade the existing Red Team module of the Averiq / Sentinel AI FYP application from 25 fixed category templates with exact-marker scoring into a promptfoo-style module: test plugins with severity levels, disguise strategies, exact-evidence grading with an optional labelled LLM judge, a 0-10 risk score, compliance coverage mapped to OWASP LLM Top 10 (2025), MITRE ATLAS, NIST AI RMF and the EU AI Act, a trend against the previous run, and a report that leads with the raw-versus-protected result. Build it on the existing durable queue, worker, recovery and admission code. The approved visual source is `design/red-team/v3` (approved 2026-11-11).

The user obtained permission from the code owner to reuse code from `~/Downloads/scheduler_umr.zip` (the company scheduler). Reusable parts: `utils/risk_scoring.py` (a Python port of promptfoo's MIT-licensed risk scoring) and the `FRAMEWORKS` mapping in `utils/constants.py`. The schedulers, runner and Mongo layout are not reused.
