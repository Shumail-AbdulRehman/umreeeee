# v1: static composition

Use the existing Averiq office-work identity to make the conversation the primary surface. A slim policy disclosure, one visible New chat control, a quieter history pane, and a bounded composer replace repeated controls and competing headers.

- Fixed brand: Inter UI/prose, JetBrains Mono for code; graphite navigation and a restrained violet action. Existing root DESIGN.md governs the identity.
- Layout: two purposeful panes inside the app shell; 72ch reading measure; locally scrollable tables/code; mobile history is a native focus-managed dialog in this prototype and will reuse shadcn Dialog in the real app.
- Three screens: conversation.html, new-chat.html and blocked.html. Every visible account, provider, record and reply is labeled sample data. No API, authentication or backend dependency is used.
- The deterministic gpt-taste probe and product-specific overrides are recorded in docs/planning/design-constraints.md. No marketing imagery, display-font swap, pinned scroll or large section spacing was adopted.
- Response examples use semantic HTML to show the visual outcome of Markdown. The production renderer is planned separately; these HTML examples are not a parser implementation.
- v1 has no authored motion. Basic native controls and copy feedback make the static prototype reviewable.
