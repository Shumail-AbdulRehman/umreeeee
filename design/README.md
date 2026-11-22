# Prompt Studio design review

Date: 2026-11-04. Current version: **v3, approved 2026-11-04**.

Open `index.html` for the review overview, or open a v3 HTML screen directly from disk. These are build-free prototypes; none calls the application API. They use synthetic records and explicitly identify sample data. The optional font stylesheet is external; system fonts remain a fallback.

| Stage | Role | Output | State |
| --- | --- | --- | --- |
| v1 | gpt-taste | Static composition for conversation, empty and blocked states | Frozen |
| v2 | animate | Purposeful feedback, mobile history motion, reduced-motion alternative | Frozen |
| v3 | impeccable | Independent critique, technical evidence and final polish | Approved 2026-11-04 |

## Final review targets

- `v3/conversation.html`: structured assistant prose, lists, comparison table, inline/fenced code and copy.
- `v3/new-chat.html`: clean empty workspace with the same reachable composer.
- `v3/blocked.html`: truthful sample policy decision, with no fabricated model reply.
- `v3/styles.css`: token/typography/layout source for the future closed design system.
- `v2/NOTES.md`: motion decision table.
- `v3/NOTES.md`: critique/polish findings and verification limits.

## Approval and execution authorization

Approved 2026-11-04. User answer, verbatim: “just go for it”. This approves v3 and authorizes implementation of the requested Prompt Studio refinement and Markdown rendering. The subsequent time estimate was explicitly for app implementation and checks. Approved v3 is now read-only.

## Preview server lifecycle

During review only: `python3 -m http.server 5188 --bind 127.0.0.1 --directory design`.
The planning agent stops that process before its final response. Direct-file previews remain available without a server.
