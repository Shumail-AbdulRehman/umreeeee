# Prompt Studio design system

Source: design/v3 (approved 2026-11-04). User approval: “just go for it”. Scope: the Prompt Studio refinement. Root DESIGN.md continues to govern other application pages.

## Direction
Retain Averiq’s light workspace, graphite navigation and restrained violet actions. Make conversation reading the primary task; avoid decorative dashboards, repeated headings and oversized composition.

## Closed tokens
Only these approved tokens and the documented incumbent aliases below are available. Raw values belong in this document or design/, never copied into feature CSS.

| Token | Approved value |
| --- | --- |
| `--canvas` | `#f7f7fb` |
| `--surface` | `#fefeff` |
| `--surface-subtle` | `#f4f4f7` |
| `--line` | `#e0e0e8` |
| `--line-subtle` | `#ebebf1` |
| `--ink` | `#25252e` |
| `--ink-secondary` | `#575763` |
| `--ink-muted` | `#686875` |
| `--accent` | `#5741bf` |
| `--accent-hover` | `#4733a6` |
| `--accent-soft` | `#f0edfc` |
| `--nav` | `#19191f` |
| `--nav-line` | `#34343d` |
| `--nav-text` | `#c9c9d2` |
| `--success` | `#176b52` |
| `--success-soft` | `#e9f5ef` |
| `--danger` | `#a53043` |
| `--danger-soft` | `#fcf0f2` |
| `--font-ui` | `'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif` |
| `--font-code` | `'JetBrains Mono',monospace` |
| `--radius-control` | `7px` |
| `--radius-panel` | `10px` |
| `--space-1` | `4px` |
| `--space-2` | `8px` |
| `--space-3` | `12px` |
| `--space-4` | `16px` |
| `--space-5` | `20px` |
| `--space-6` | `24px` |
| `--space-8` | `32px` |
| `--body-size` | `14px` |
| `--body-leading` | `1.75` |
| `--reading-measure` | `72ch` |
| `--sidebar-width` | `222px` |
| `--history-width` | `220px` |
| `--motion-fast` | `160ms` |
| `--motion-standard` | `200ms` |
| `--ease-out` | `cubic-bezier(.23,1,.32,1)` |

## Incumbent aliases
Implementation reuses the existing root variables: --bg (canvas), --panel (surface), --panel-2 (subtle surface), --line and --line-2 (dividers), --ink/--ink-2/--ink-3/--ink-4 (text), --indigo and --indigo-bg (action/selection), --green/--green-bg, --rose/--rose-bg and --amber/--amber-bg (semantic state), --font-sans and --font-mono. These aliases retain the incumbent theme; do not change root tokens or navigation.

## Typography
Inter for controls and prose; JetBrains Mono for actual code. Use 11px metadata, 12px controls, 14px response prose, 16px mobile input, 17px response subheading and 25px page title with the inherited line heights. Prose measure is 72ch. Code and tables may use full available width in locally scrollable containers. Heading levels must not replace the page’s h1.

## Spacing, radii and elevation
Use the declared 4/8/12/16/20/24/32px scale. Controls 7px, panels 10px. Borders provide routine separation; existing popover/dialog elevation is reserved for overlays. Keep one primary composer and one visible New chat entry per layout.

## Layout conventions
Desktop app sidebar is incumbent; chat history is a secondary 220px pane. Below 960px use a focus-managed history dialog, keeping direct New chat and conversation controls available. Minimum widths of nested grid/flex areas are zero. Transcript is the main vertical scroller. Tables and code scroll locally with keyboard access; the composer remains reachable. Do not copy prototype shell markup into the app.

## Component conventions
Use existing shadcn Button, Dialog and Popover primitives, BrandMark and permission helpers. Keep provider/model controls labeled; present generation options progressively. Preserve actual pending, setup-required, history-error, retry, blocked, withheld and expired states. Raw user prompts remain plain text. Renderer and clipboard work only on permitted, retained assistant text.

## States and motion
Transcribed from design/v2/NOTES.md: hover/control color feedback 160ms, strong ease-out; optional pointer drawer opacity/translation 200ms with opacity-only reduced motion; keyboard drawer open/Escape immediate. No animation on typing, send, reading, conversation change or copied content. Copy completion/failure uses a live region and stable action names. Reuse existing Radix focus behavior and reduced-motion preferences.

## Accessibility floor
Text contrast at least 4.5:1; large text at least 3:1. Visible focus, meaningful names and logical keyboard order are required. Mobile actions and form controls target 44px. Scroll regions need keyboard access. Read-only Markdown task checkboxes must not become editable application tasks. No comprehensive WCAG or physical-device keyboard certification is claimed.
