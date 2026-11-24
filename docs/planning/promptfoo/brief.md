# Brief — Red Team on promptfoo (Option B)

Recorded 2026-11-22.

Supervisor (voice note, 2026-11-22, transcribed by the owner): "Red team ke case ke andar … aap logon ne promptfoo ka setup
nahin kiya." Follow-up from the supervisor relayed by the owner: "promptfoo ke saath hi redteam run hoga" — the red team
must run on promptfoo itself.

Owner's instruction (2026-11-22): "go with the option B the big one … first do a detail research to how to fit it in our
app and remove our custom logic and use the option B and first write detailed specs and also make sure the design is good
and beautiful and not look AI generated." Then: "make sure the implementation of those specs will be done by codex so make
the specs detailed." Then: "just go with the full promptfoo one" (promptfoo hosted generation with a verified account).

Option B, as explained to the owner: the app's own Red Team page launches promptfoo on the server (the backend worker runs
the promptfoo CLI), each test prompt still reaches the target through the app (raw = provider directly, protected = the app's
policy pipeline), and promptfoo's results replace the custom engine's results in the app's own report screens.
Option A (promptfoo as an external tool pointed at the app) was rejected by the owner.
