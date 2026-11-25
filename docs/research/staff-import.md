# Staff Import research

Checked against the local tree on November 26, 2026.

| Source | Constraint for the design |
| --- | --- |
| `backend/app/schemas/users.py` | Current first and last names are 2–120 characters, email is 5–255, department is 2–160, and allowed account roles are `user` and `org_admin`. |
| `backend/app/services/user_management_service.py` | Reuse name and email normalization, invite lifecycle, audit, pending account serialization, and Resend. Account creation and SMTP delivery are already separate outcomes. |
| `backend/app/services/admin_common.py` | Existing organization transactions serialize changes by updating the active company record and retry transient transaction errors. |
| `backend/app/core/permissions.py` and `backend/app/db/indexes.py` | Organization management roles are evaluated server-side. Email uniqueness applies across companies, so failure copy must avoid disclosing where an address is registered. |
| `backend/app/services/email_service.py` | SMTP has a 20-second connection timeout and reports sent/unavailable. A file import can create several accounts quickly in one transaction, while sending email inside the request would delay the receipt. |
| `Frontend/src/pages/UsersPage.jsx` and `Frontend/src/services/users/userManagementService.js` | Add a Staff Import entry next to Invite user and follow existing directory refresh and invitation status patterns. |
| `Frontend/package.json` and `backend/tests/integration/conftest.py` | Vitest and Playwright are installed. Persistence tests can use isolated MongoDB databases on a replica set. |
| `DESIGN.md` | Inter, graphite navigation and violet actions are the incumbent design. Use clear status labels as well as color. |
