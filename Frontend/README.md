# Sentinel AI frontend — local development

Run `npm ci`, then `npm run dev`. The Vite development server proxies `/api` to `http://127.0.0.1:8000`; start the backend as described in [backend/README.md](../backend/README.md). Run `npm run lint` and `npm run build` before handing off changes.

Phase 1 provides real administration pages for users, groups, policies, integrations, and organization settings. The overview shows database counts, not simulated incidents. Prompt Studio can call active provider integrations but **does not enforce policies yet**. Do not submit sensitive prompts on the assumption that Phase 1 policies block or log them.

The browser stores only the bearer token in local storage; organization membership and policy scope come from the server. A protected request returning 401 clears the token and returns to sign-in. Creating accounts or inviting users requires a working SMTP sink on the backend; no verification code or invitation token is displayed in the browser as a delivery fallback.
