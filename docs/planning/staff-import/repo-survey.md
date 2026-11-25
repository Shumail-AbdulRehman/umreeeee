# Staff Import repository survey

Reviewed November 26, 2026. The branch is `promptfoo-redteam`; its latest commit during intake is `2b3ee6a`. Existing Red Team work is in progress in the working tree. The Staff Import design and plan use isolated directories.

The application has React and Vite in `Frontend/` and FastAPI/PyMongo in `backend/`. `Frontend/src/pages/UsersPage.jsx` already offers an Invite user action and per-user Resend. `backend/app/services/user_management_service.py` validates input, creates an invited account in an organization transaction, and records SMTP delivery separately after commit. `backend/app/db/indexes.py` enforces global email uniqueness. Existing Browser and API harnesses use Chromium and disposable MongoDB replica sets.
