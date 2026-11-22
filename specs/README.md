# Prompt Studio refinement and Markdown

Approved v3 on 2026-11-04: “just go for it”. Scope is the requested existing page and rich assistant-response presentation. No backend/auth/API/storage/deployment changes.

Related set: the Red Team v3 plan lives in `../specs-red-team/` (planned 2026-11-11) with its own steering docs, tracker and validator run.

## Spec index

| # | Spec | Wave | What it covers |
| --- | --- | --- | --- |
| 00 | [Presentation-only decision](00-presentation-decision.md) | 0 | Presentation-only decision |
| 01 | [Component harness and Markdown dependencies](01-component-harness.md) | 1 | Component harness and Markdown dependencies |
| 02 | [Safe assistant Markdown and copy](02-assistant-markdown.md) | 2 | Safe assistant Markdown and copy |
| 03 | [Compact truthful policy context](03-policy-notice.md) | 2 | Compact truthful policy context |
| 04 | [Responsive history presentation](04-chat-history.md) | 2 | Responsive history presentation |
| 05 | [Compact controlled composer](05-composer.md) | 2 | Compact controlled composer |
| 06 | [Approved layout and presentation integration](06-studio-integration.md) | 3 | Approved layout and presentation integration |
| 07 | [Integrated Prompt Studio proof](07-e2e-suite.md) | 4 | Integrated Prompt Studio proof |
| 08 | [Clean verification and reuse audit](08-verification-pass.md) | 5 | Clean verification and reuse audit |

## Waves and dependency order

0 decision; 1 harness; 2 renderer/policy/history/composer in parallel; 3 integration; 4 browser proof; 5 final verification. Dependencies list only consumed upstream components except the explicitly exhaustive final gates.

## Design and research

Approved visual source: ../design/v3; motion: ../design/v2/NOTES.md. Repository/source/package evidence and model metadata are in ../docs/research; brief, intake, raw DAG/splits and validator output are in ../docs/planning. Design prototypes use labeled synthetic records and never become production fixtures.

## Status legend

Not started, In progress, Blocked, Done. PROGRESS.md is authoritative; per-spec Log contains evidence.

## Open questions

None blocks local implementation. Real provider access, deployment and physical mobile keyboard checks remain external verification, not invented success claims.

## Known gaps

The nine-unit set has a short fixed scaffold/integration/test chain, so its critical path exceeds half the small spec count. This is accepted because each edge consumes a real artifact and four implementation units fan out in wave 2. Exhaustive e2e/final gates intentionally list all earlier units even when some edges are transitively implied. No state-management or repository-wide architecture migration is authorized. Existing JavaScript source has no typecheck command. External issues/PRs and deployment are not part of this user-authorized dirty-workspace execution.

Accepted bookkeeping warnings: completed local units intentionally have no GitHub issue because this is user-authorized direct work in a pre-existing dirty tree, with no publication. The final verification report is a terminal human artifact, so it deliberately has no later implementation consumer. Log dates are ordinary dated bullets; the validator may prefer dated subheadings, which are added when execution starts. These are metadata/terminal-artifact gaps, not unconsumed UI or API features.
