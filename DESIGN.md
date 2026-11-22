# Averiq design system

## Product direction

A precise, approachable work environment for administrators reviewing security and employees working with AI. The primary scene is daily work on laptops in a well-lit office. Use a light interface, warm graphite navigation, and a restrained violet accent. Decisions, evidence and configuration deserve more visual weight than decorative branding.

## Foundations

- Typography: Inter, with a native system fallback. 13–14px controls/body, 12px secondary text, 16px section titles, 28px page headings. Numeric data uses tabular figures.
- Surfaces: near-white content, pale violet-gray canvas, graphite sidebar. Semantic green, amber and rose indicate state; always include text.
- Accent: violet for primary actions, selection and focus. Chart colors distinguish allowed, blocked, other and cost with consistent legends.
- Rhythm: 4px base spacing, 16px table padding, 20–24px surface padding, 24px content gutters, larger separation between report sections.
- Shape: 7px controls, 10px surfaces, small border-only badges. Shadows reserved for floating menus and dialogs.
- Motion: 160–200ms color/opacity/transform feedback. Respect reduced motion. No entry choreography or invented activity.

## Component foundation

Use locally owned shadcn/ui JavaScript components built on Radix, customized through semantic tokens. Reuse accessible buttons, menus, popovers, dialogs, inputs, skeletons and table primitives. Keep application API/services and permission logic independent of visual components.

## Layouts

- Admin: collapsible navigation, compact breadcrumb header, explicit page headings, useful report visualizations and dense management tables.
- User: the same navigation language with only existing permitted routes; calm conversation transcript and reachable composer.
- Authentication: shared split layout with product-led copy and focused forms; a compact brand header on small screens.
- Mobile: structural single-column layouts, navigable sidebar dialog, responsive tools, bounded table scrolling and viewport-safe dialogs.

## Data and accessibility

Use existing API data only. Do not invent trends, health, revenue or comparative metrics. Show dates/timezones and unknown usage/cost. Loaded-page sorting must be labeled as such. Charts include readable tooltips, legends and a table alternative. Dialogs trap focus and restore it; all controls have keyboard focus. Retain all existing validation and action permissions.
