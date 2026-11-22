# Spec 08 — Clean verification and reuse audit

**Status:** Done
**Depends on:** Spec 00, Spec 01, Spec 02, Spec 03, Spec 04, Spec 05, Spec 06, Spec 07
**Model:** Heavy — `claude-opus-5-5` · `gpt-6-astra` · `gemini-4-argon`
**Issue:** —
**Owns:** `specs/INVENTORY.md`, `docs/planning/implementation-verification.md`
**Reuses:** `design/v3/conversation.html`, `design/v3/new-chat.html`, `design/v3/blocked.html`, `DESIGN-SYSTEM.md#closed-tokens`, `INVENTORY.md#chat-state`

## Goal

Run a clean install, both complete unit suites, integrated browser checks, lint/build and the spec validator.

## Scope

Inspect `Frontend/package.json`, `Frontend/package-lock.json`, `Frontend/.gitignore` and `Frontend/tests/setup-components.js` and `Frontend/tests/admin-policy-groups.browser.cjs` while doing the clean install and full-suite verification.

- Re-check every previous criterion against current files; fold inventory fragments and scan for duplicate helpers.
- Compare protected baseline hashes and review source diff for unintended backend/API/auth changes.
- Record real test counts, remaining external limitations and the fact that live Netlify deployment is separate.

## Explicit non-scope

- Markdown behavior implementation → spec 02.
- Layout integration changes → spec 06.

## Reuse first

- Read the cited inventory and approved screen before creating components.
- Preserve the existing transport, permission helpers and controlled component contracts.
- Use the declared local shadcn foundation; do not add another parser/overlay/state system.

## Steps

1. Inspect owned paths and upstream artifacts against the real tree.
2. Record or verify only the bounded responsibilities above.
3. Save reuse entries in this unit’s fragment where applicable; record evidence and limitations.

## Done when

- [x] Clean `npm ci`, `npm test` and the complete studio/workflow browser runs pass; counts and artifacts are recorded. [suite]
- [x] Protected source hashes match, inventory is folded, every prior criterion is re-checked and the validator has no errors. [static]
- [x] `npm run lint` passes with no errors or warnings. [static]
- [x] `npm run build` passes. [static]

## Log

- 2026-11-04: Planned after explicit design approval. Implementation/verification has not started; no result is claimed.
- **2026-11-04**: Clean npm ci passed (439 packages, 33s). Final npm test passes 8 Node and 81 component tests in 6 files; lint exits 0 without errors/warnings; production build passes. After the bounded spec 04 drawer correction, all 15 Studio cases pass against freshly built production assets (55.1s). The complete existing three-script workflow run also passes against the production preview. Eight selected WCAG axe scans report no violations; no page JavaScript exceptions were recorded. All 127 protected source hashes match and seven orchestration functions remain byte-identical. Reuse fragments 01–06 were folded into INVENTORY.md and removed. Local dirty-workspace changes were preserved; no commit, deployment or provider call was made.
- **2026-11-04**: Remaining limitations and artifacts are recorded in docs/planning/implementation-verification.md. Validator bookkeeping warnings for missing remote issues and the terminal report are accepted in README.md; no permission or approval gate remains.
