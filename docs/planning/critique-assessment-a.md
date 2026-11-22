# Assessment A: Prompt Studio v3 design review

Date: 2026-11-04. Target: `design/v3/conversation.html`, `new-chat.html`, `blocked.html`, `styles.css`, `prototype.js`. Independent design assessment; no detector or Assessment B output was read. This reviews the prototype before the parent polish pass, not the production application.

## Evidence and limits

Inspected a fresh Playwright/Chromium context at 1440×900, 1280×800 and 390×844. Read the fixed brief and root DESIGN.md. Exercised transcript scrolling, table/code presentation, generation options, native mobile history dialog, Escape and focus return. Screenshots and measurements are under `/tmp/studio-review-a-*`. The three pages produced no horizontal page overflow or JavaScript errors. Composer remains in view; transcript measured 477px high at 1440×900, 377px at 1280×800 and 449px at 390×844. The table and fenced code are readable, locally bounded surfaces. Desktop and mobile keyboard histories returned focus to their trigger after Escape.

No API is called. Response rendering here is pre-authored semantic HTML, not a validated Markdown parser. Idempotency, polling, server permissions, retention, failed-request recovery and original-Markdown clipboard fidelity must be proved during application implementation; the design preview does not certify them. Physical touch, virtual-keyboard behavior and screen-reader speech were not tested.

## Design specificity

The composition fits Averiq rather than a marketing dashboard: it retains the graphite app navigation, restrained violet, Inter UI and code-only monospace, and puts organization policy context and per-message security inspection beside a quiet conversational reading surface. Removing the duplicate chat headings and moving the policy explanation behind disclosure gives useful space back to the actual work. The strongest product-specific detail is that blocked input is a policy outcome instead of a fabricated assistant answer.

The remaining weakness is miniature control typography and some mismatched sample-state details. A sparse visual style should not require squinting at 8–10px controls or remembering a conversation selection that does not match the current screen.

## Nielsen heuristic assessment

| # | Heuristic | Score / 4 | Evidence |
| --- | --- | --- | --- |
| 1 | Visibility of system status | 3 | Active chat, clear sample-state label and allowed/blocked status are legible. Empty/blocked pages retain the wrong history selection. |
| 2 | Match with real world | 3 | Familiar conversation, composer, Markdown reading structure and meaningful policy language. The blocked example does not actually contain the declared email match. |
| 3 | User control and freedom | 3 | Native history dialog closes with Escape and returns focus. Mobile New chat requires opening history first. |
| 4 | Consistency and standards | 3 | App tokens, native form controls and semantic content are coherent. An icon-only Options control loses its accessible name on mobile. |
| 5 | Error prevention | 3 | Empty sample submit is disabled; no API or unrestricted HTML is simulated. Safety behavior remains an implementation obligation. |
| 6 | Recognition rather than recall | 2 | History titles are meaningful. Mobile selector values truncate at 119px and 9px font, and generation settings become an unlabeled icon. |
| 7 | Flexibility and efficiency | 2 | Compact persistent composer and copy affordances are good. The mobile path to New chat is less direct than it should be. |
| 8 | Aesthetic and minimalist design | 3 | Restrained hierarchy, readable response width, clean tables and code. Secondary controls and notes are too miniature for a premium work tool. |
| 9 | Error recovery | 2 | Preview copy failure is explained. History-error, missing-integration and request-retry presentations are not represented in these three prototype states; preserve and test incumbent behavior in the eventual specs. |
| 10 | Help and documentation | 3 | Policy disclosure, desktop Enter/Shift+Enter hint and context note explain the workflow without a large banner. Mobile icon-only controls need clear names. |
| **Total** | | **27 / 40** | Strong structure; polish the control and state details before approval. |

## Priority issues

### P1: Generation Options loses its accessible name on mobile

`styles.css` hides `.generation-options summary > span` at the small breakpoint; its remaining SVG is `aria-hidden`. The visible result is an icon-only summary with no accessible name. Give the summary an explicit name or visually hide rather than remove the text from accessibility. Preserve a visible label when space permits. This is a concrete keyboard/screen-reader blocker, not a style preference.

### P2: Mobile controls are too small and their typography is too fine

At 390px the options and send controls measure 35×36px, and both selects are 119.5×36px with 9px text. History and header controls are similarly tight. Increase the primary touch targets toward the brief's practical 44px goal and use at least 11px for interactive values where possible; reflow the toolbar if needed. The existing dimensions clear WCAG 2.2's basic 24px target threshold, so do not misreport this as a proven AA size failure. It is a usability and design-quality issue.

### P2: Sample state and recorded explanation disagree

`new-chat.html` highlights “A clear plan for the release” despite its New conversation heading. `blocked.html` highlights that same first chat rather than “Review a policy decision”. Its prompt asks for a release plan, while its recorded check says Email addresses; there is no email in the displayed prompt. Match the selected history item to each screen and use an unmistakably synthetic prompt containing the type of content its sample check reports. The global prototype also labels the user “Workspace member” while showing admin management navigation; mark it Administrator or render the proper member shell. These are fixture consistency corrections, not backend changes.

### P2: New chat is not directly discoverable on mobile

Below 960px the entire history pane, including the only New chat control, disappears. The conversation header offers only a chat-history icon. Add one clearly named New chat affordance in the mobile header, while keeping the desktop history action as the single visible primary entry point at desktop sizes. Avoid restoring three duplicate buttons.

### P2: Copy and recovery contracts need explicit implementation handoff

The prototype's full-response copy uses `innerText`, which intentionally demonstrates a visual interaction but strips source Markdown. The approved implementation must copy the original permitted `response_text`; code copy must preserve its literal code and whitespace. Keep withheld/expired guards ahead of both rendering and copy. Include the incumbent error/history recovery and busy states in the implementation flow table rather than assuming this static preview proves them.

## Persona and cognitive-load checks

- **Alex, frequent workplace user:** The stable composer, useful reading width and single desktop New chat control improve focus. On mobile, the extra history-open step and truncated integration/model labels slow repeated work.
- **Sam, keyboard/screen-reader user:** Native dialog focus/Escape behavior is good. The mobile Options summary needs an accessible name; task checkboxes must remain read-only document content rather than accidental editable tasks.
- **Casey, distracted mobile user:** No page overflow, readable prose and reachable send are strengths. Small adjacent 35px controls and very fine selector text are difficult to acquire one-handed.
- The composer presents four familiar controls, not a large choice menu. Policy context and generation settings are progressively disclosed rather than shown as permanent dense forms. This is the right hierarchy.

## Strengths to preserve

1. Conversation content gets substantially more vertical room without changing the app's identity.
2. Semantic Markdown examples establish visible hierarchy, restrained tables and unambiguous fenced code without decorative charts or fake statistics.
3. The explicit allowed/blocked distinction and native history dialog are familiar, task-appropriate patterns; motion does not interrupt reading or typing.

## Approval recommendation

Polish the P1 accessible-name defect and the three presentation/state-consistency issues before showing v3 for approval. Carry the Markdown source-copy and recovery requirements into the implementation specs. No new brand, backend endpoint, chat-state rewrite or animation dependency is justified.
