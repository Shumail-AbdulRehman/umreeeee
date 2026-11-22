# v3: independent critique and final polish

Date: 2026-11-04. Status: ready for design approval; production code is unchanged.

## Review provenance

Impeccable Assessment A and B ran as isolated agents with separate browser contexts. A completed its design judgment before the parent read B's deterministic findings. Full reports: `docs/planning/critique-assessment-a.md` and `critique-assessment-b.md`. A scored the pre-polish prototype 27/40. B ran one CLI scan (146 repeated records across three screens), axe and browser injection in its own headless tab; no human-visible overlay is claimed. B stopped its live-server process without mutating source.

The detector's repeated small-text findings were real. Its Inter warning is an intentional exception because the Averiq font is a fixed input. Shell-padding and icon-tile flags were contextual false positives: the workspace has correctly padded child panes and purposeful controls/brand identification, not feature-card decoration. Raw prototype colors are allowed under the planning skill; the eventual closed token list is derived only after v3 approval.

## Changes from v2

1. Fixed the mobile Generation options accessible name independently of the hidden visual label.
2. Raised functional small text to at least 11px, most native control values to 12px, mobile input to 16px and mobile prose to 14px. Metadata remains secondary without disappearing into 8–9px copy.
3. Reflowed the mobile provider/model toolbar so integration is readable and the adjacent options/send targets are 44px. History/new-chat/close actions similarly have comfortable mobile targets.
4. Added one direct mobile New chat affordance while keeping the desktop history action as the only visible desktop New chat entry.
5. Corrected sample history selection on empty and blocked screens, used a synthetic email in the blocked example, and aligned the synthetic Administrator role with the management navigation.
6. Full-response copy now preserves the original Markdown example. Code copy preserves exact code/whitespace. Copy success and failure use a live region and leave action labels stable.
7. Kept the reading surface, body measure, bounded table/code overflow, compact composer and native focus-managed history. No page or text choreography was added.
8. Made the transcript a labeled, keyboard-focusable scroll region with a visible focus outline. The laptop blocked-state check caught this when larger readable text caused overflow.

## Check result

`docs/planning/v3-verification.json` records final browser checks for three screens at desktop/laptop/tablet/mobile sizes. It includes overflow, composer reachability, one visible New chat action, axe rules, mobile target size, dialog Escape/focus, source-Markdown/code copy, rejection fallback and reduced-motion behavior. The detector was not repeated after polish; its known findings were verified by source/computed-size and browser checks.

## Explicit limits

This is a visual design prototype, with pre-authored semantic HTML representing Markdown output. It is not a Markdown parser implementation or proof of live API/auth/policy behavior. The future application specs must test raw HTML/unsafe-link handling, original response preservation, protected/expired output, actual request/retry/history contracts and real clipboard failure. Physical mobile keyboard/screen-reader behavior and Safari/Firefox have not been tested. No fabricated metrics, data endpoint or model call is introduced.

## Approval

Await the user's explicit v3 approval before transcribing specs/DESIGN-SYSTEM.md or completing implementation specs. This requirement comes from the user-invoked plan-project skill, not an inferred permission policy.
