# Staff Import implementation plan

## Product decision

An organization administrator uploads a CSV, reviews every row, then confirms the batch. **Every row must pass validation before any account can be created.** If a row becomes invalid after preview, the entire account-creation transaction fails and the admin gets a new actionable preview.

Use the existing Users screen as the entry point. This draft covers creating regular staff accounts and sending the usual invitation to each employee. The four required columns are `first_name`, `last_name`, `email`, and `department`. Existing accounts are never altered. Role changes, group assignment in the file, passwords, and spreadsheet formats beyond CSV are outside the first release. Policy groups can be assigned in Users after import.

Proposed starting limits are 100 staff records and 256 KB of UTF-8 CSV, including quoted comma support and an optional byte-order mark. Errors use the starting physical CSV line, with the header on line 1. Apply the same field lengths and normalization as the existing Invite user flow.

## Screen flow

| State | Admin action and response |
| --- | --- |
| Upload CSV | Choose or drop a CSV. Download the exact template from the same screen. Show the accepted format and limits before file selection. |
| File cannot be checked | Name the problem and suggest a next action. Missing header, duplicate header, malformed quoting, wrong encoding, empty file, and size limit each have their own message. Keep Replace CSV available. |
| Review with issues | Show valid and invalid row counts. Each issue has a CSV line number, field, plain-language reason, and fix. Offer Show issues only, Download issues, and Replace CSV. Keep Import disabled. |
| Review ready | Show the exact invitation count and a single confirm action labelled Import N staff. Upload and preview remain read-only. |
| Saving and delivery | Prevent duplicate submits. After atomic provisioning, show a receipt with separate created, sent, pending and needs-attention counts. An SMTP failure leaves a valid invited account. The existing Users Resend action handles recovery. |
| Conflict or reconnect | Use the same idempotency key to recover uncertain commit outcomes. For a new validation conflict, return the affected row and ask the admin to revalidate. Report-resume can show the receipt even after the file has been cleared. |

Preview reference: [Staff Import v3](../../../design/staff-import/v3/index.html). The prototype demonstrates sample receipts locally. Production receipt statuses come from the server.

## Proposed contracts

- `POST /api/users/imports/validate` accepts a bounded `text/csv` body. The server validates encoding, file shape, record count, normalized fields and email availability. Respond with row numbers, display fields, structured issues and totals. Return a short-lived, signed validation proof only when all rows pass. Bind that proof to the file digest, company, actor and expiry.
- `POST /api/users/imports` accepts the same bytes plus the proof and a client-generated idempotency key. Reuse the same parsing and validation. In the organization transaction, recheck actor authority and email availability, then create all users, audit events, receipt and invitation jobs together. Use the unique email index as the final guard against races, including other companies. If that index rejects a commit, abort and resolve which submitted rows now conflict without disclosing any other company.
- `GET /api/users/imports/{id}` returns the company-scoped receipt and current delivery statuses. A retry with the same key and same digest returns the original receipt before requiring an unexpired proof. A reused key with a different digest conflicts. Reject missing authentication and regular staff at every route. Revalidate privilege and active organization state inside the commit transaction.
- Use safe file-level and row-level errors. Examples include “Missing required column: department”, “Row 4, Email: duplicate of row 2”, and “Email is already registered.” Show which submitted address caused the issue without returning another organization’s details. The issue download includes row, field, reason and fix, with spreadsheet-safe escaping.
- Keep CSV bytes short-lived in request memory. Persist receipt and audit metadata using row numbers and user references rather than raw file contents. Keep receipt rows and delivery jobs tenant-scoped. Preview uses a distinct request ID and makes no account, audit, or email mutations. Never return raw invite tokens or SMTP diagnostics to the UI.

## Invitation delivery

Reuse the existing invitation record format, token expiry, link sender, directory labels and Resend behavior. Queue durable per-invitation jobs inside the provisioning transaction and send outside it using a bounded worker. Work stays pending across worker restarts. Jobs refer to user IDs and receipt IDs.

Preserve the `invited` state until acceptance. Keep a pending invitation hash on the account at creation using a random token whose original value is discarded. The delivery worker issues a fresh token and updates the hash immediately before sending, using a fenced claim plus an invited, active user check. Keep the actual delivery token in process memory. A manual Resend and the worker must use coordinated per-user writes so they cannot issue competing email attempts. Recheck the account and claim just before dispatch. Skip an accepted, inactive, or superseded account. If an account changes after SMTP dispatch begins, the attempt cannot be recalled and the stale or revoked link must fail validation. A confirmed send or failure updates the receipt and current user only when the attempt still owns the write. An ambiguous post-send crash is marked unconfirmed and left for deliberate recovery through Users. Recover an expired pre-send claim without creating another account.

Plan SMTP errors as delivery outcomes. Keep “account created” distinct from “email sent” and keep “sent” distinct from “employee accepted”. Include a worker deployment and restart check in final verification. Assess single-process runtime and throughput on the actual deployment before increasing the initial row or byte cap.

## Dependency-ordered implementation units

| Unit | Depends on | Owns and verifies |
| --- | --- | --- |
| 00 Decisions and contract | Approved design | Freeze fields, limits, error shape, idempotency and staff-only scope. |
| 01 CSV parsing and normalization | 00 | Bounded UTF-8 decoder, comma/quote handling, row and column errors, case-insensitive duplicate detection, shared invitation validation. |
| 02 Receipt, jobs and invitation persistence | 00 | Mongo indexes and transaction participant for pending users, receipt and jobs. Preserve single-invite behavior while factoring reusable logic. Verify rollback and retry. |
| 03 Delivery and recovery | 02 | Leased job worker, fenced send status, failure/unknown handling, safe coexistence with Resend, restart behavior and local process configuration. |
| 04 Import API | 01, 02 | Tenant-scoped validate/commit/read routes, proof and idempotency semantics, structured errors and race handling. API tests invoke no real SMTP. |
| 05 UI components and interactions | 00, approved design | Upload, file recovery, row review, issue export and receipt components using mock service data. Keyboard and mobile behavior match v3. |
| 06 Users wiring and API client | 04, 05 | Import staff entry, application client, stale response protection, pending receipt refresh, back navigation, and coexistence with single invite. |
| 07 Browser acceptance | 03, 06 | Verify the full flow in Chromium using a fixture API, plus Mongo and fake-SMTP acceptance for the real persistence and worker paths. |
| 08 Verification | 07 | Run lint, production build, backend and frontend suites, browser acceptance, accessibility checks, deployment dry run and dependency audit. |

Units 01, 02 and 05 can start together. Units 03 and 04 can run concurrently once their inputs are available. Keep separate ownership for the persistence helper, the route adapter and the UI entry point. Assign any shared change to its dependency rather than duplicating logic between units.

## Acceptance cases

1. A valid CSV creates exactly one pending invited account for every row after confirmation. Refresh or retry returns the same receipt and creates no extra account or mail job.
2. One invalid row in a mostly valid file blocks everything. Malformed quoting, missing/extra/duplicate headers, non-UTF-8, empty or oversized files, and row/field errors all show their own reason. The issue download opens as plain data.
3. A duplicate email inside the file or concurrently registered by another request prevents the batch. Same-company and other-company conflicts reveal only that the submitted address is already registered.
4. A regular employee, suspended organization and cross-company receipt request are denied. Attempts to import roles or sneak additional columns through the UI are rejected by the backend.
5. Preview performs zero writes and sends zero email. A DB or audit failure aborts every new account and delivery job. Retry cannot duplicate jobs after an uncertain transaction response.
6. An SMTP failure shows in the receipt without removing the created account. Existing Resend recovers it. Accepted or deactivated accounts and ambiguous post-dispatch outcomes behave as described in the delivery rules.
7. The admin can review errors at 320 px and recover with keyboard alone. Replacement clears the old proof, file labels and stale requests. Confirmation and receipt behavior survive reload or network failure.
8. A normal single-user invite, invitation acceptance and existing group management still work.

**Planning status** — draft for design approval. The final design tokens, trackable spec set and validator pass follow approval of the v3 preview.
