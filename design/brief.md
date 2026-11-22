# Prompt Studio refinement brief

Date: 2026-11-04. Status: design exploration, not approved.

## Purpose and scene

Employees and administrators read model replies, ask follow-ups, and inspect organization policy decisions during daily laptop work in a well-lit office. The conversation should receive most of the viewport. This is Operate mode with a Read response area.

## Fixed inputs

Preserve Averiq name/mark, existing Inter and JetBrains Mono typography, graphite global navigation, light neutral surfaces, restrained violet actions and semantic statuses from the root DESIGN.md and Frontend/src/index.css. This is user-supplied incumbent branding, not Zeki or an open rebrand. Do not change global navigation, permissions, endpoints, execution, polling, retries, keyboard submission behavior or retention.

## Three defining screens/states

1. conversation.html: existing chat with a structured assistant answer. Demonstrate headings, emphasis, lists, a compact comparison table, inline code, a fenced code block, copy controls, a compact pinned composer, provider/model controls and an accessible security disclosure.
2. new-chat.html: empty configured workspace with a clear entry point, readable policy context and the same composer. No fabricated suggestions that imply unsupported features.
3. blocked.html: a blocked-input response. Show the original user prompt and recorded check example, with no model response or copy action for withheld content. Clearly mark sample data.

Each state must work at 1440x900, 1280x800, 768x1024 and 390x844. Mobile history is a proper focus-managed dialog/drawer; it does not squeeze the conversation. Long tables and code have local scroll; the page never scrolls sideways.

## Content and boundaries

Prototype examples are synthetic and explicitly labeled. Use neutral formatting examples, not legal, medical or financial advice. Only assistant response_text is rendered as Markdown in the future app. User prompts remain literal text. Markdown supports headings, bold/italic, lists, quotes, tables, task lists, links, inline/fenced code and copy. Raw HTML is not executed; unsafe links remain blocked; remote images do not auto-load. Syntax highlighting, math, Mermaid, streaming, file uploads, voice and new history operations are out of scope.

## Composition

Keep the existing app shell as context. Remove the extra page kicker and redundant chat headers/actions. Replace the tall always-expanded policy card with a compact, truthful disclosure. Give the response a 65–75ch reading measure with room for full-width code/tables. Keep history in one secondary pane with one obvious New chat action. The composer stays at the bottom of the workspace, uses a compact default input height, and grows only within a bounded area. Keep provider/model and generation settings available with labels.

## Pipeline

v1: gpt-taste static composition adapted to the fixed product brief.
v2: animate adds only purposeful, brief, interruptible feedback; no reading or typing choreography.
v3: impeccable critique, audit and polish; approval is required before deriving specs/DESIGN-SYSTEM.md or finalizing implementation specs.
