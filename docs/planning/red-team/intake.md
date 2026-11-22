# Red Team intake

Date: 2026-11-11. Questions asked and answers given, verbatim where the user answered.

| # | Question | Answer |
| --- | --- | --- |
| 1 | How much of the FYP should I complete in this pass? | "Red Team + bug fixes (Recommended)". Later narrowed by the user: "analzye how will you implemnet the read team tetsing moduel only". Recorded scope: the Red Team module only, plus the Red Team-specific defects (draft-launch polling stall, recovery process missing from Procfiles). The other app-wide bugs (Models page for members, analytics status filter, new-tenant catalog provisioning, invitation expiry) are out of scope. |
| 2 | How should the Red Team generate attacks? | "Built-in Python (Recommended)": original templates and deterministic strategy transforms in the backend, no Node.js or promptfoo CLI at runtime. |
| 3 | How should attack results be graded? | "Exact markers + optional judge (Recommended)": exact evidence first; an optional LLM judge, using an organization integration, decides only undecided results and is labelled. |
| 4 | Can the supplied scheduler code be used? | "i have asked the guy and he gave me to use the code so its all good now". |
| 5 | Design first? | "i wnat you to make a deisgn firts of this module and i willsee it first". Design produced in design/red-team v1-v3. |
| 6 | Approve the design? | "approve now write an impmenntation plan for it make sure its detailed" (2026-11-11). |
| 7 | Change app code now? | Earlier: "dont chnage nay cnages etc". This plan changes no application code. Implementation starts only on an explicit request. |

Defaults applied without a separate question (recorded so they can be challenged):

- Brand: user-supplied incumbent Averiq brand, same as the approved Prompt Studio design.
- Stack, auth, multi-tenancy, persistence and deployment: fixed by the existing repository (FastAPI + MongoDB replica set + RabbitMQ worker; React 19 + Vite; Heroku + Netlify).
- Plugin set: the eight plugins shown in the approved design. Strategy set: plain plus seven shown in the design.
- Frameworks in v1: the four shown in the design. OWASP API, OWASP Agentic, ISO 42001, GDPR and DoD mappings from the supplied code are deferred.
