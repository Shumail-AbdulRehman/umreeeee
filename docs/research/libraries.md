# Markdown and layout research

Checked 2026-11-04. Primary sources only. Candidate packages are not installed by this planning pass.

## Findings and limits

Use react-markdown’s default component export with remark-gfm’s default plugin to render CommonMark plus GFM tables, task lists, autolinks and strikethrough. Use a scoped component wrapper to provide readable headings, table overflow and code-copy controls. Keep raw HTML disabled, preserve the library URL sanitizer (never replace it with an identity function), and avoid auto-loading external images. Copy the original Markdown response for full-response copy, and literal code text for fenced-code copy. Retain all existing output-withheld/content-expiry guards before rendering or exposing copy.

The safe renderer handles malicious links and markup as untrusted output. Parser and custom-renderer choices need meaningful semantic and attack-fixture unit tests; CSS-only screenshots cannot prove this boundary. No homegrown Markdown parser, regex HTML replacement, dangerouslySetInnerHTML, rehype-raw, syntax-highlighter, MathJax, Mermaid or streaming API is needed for this scope.

Constrain nested flex/grid items with minimum sizes appropriate to overflow. Use local overflow:auto for tables/code, a bounded transcript, and a reachable composer. Dynamic viewport units are useful but browser chrome and virtual keyboards still need testing; a resized desktop viewport is not a physical-device keyboard test.

## Sources

- https://github.com/remarkjs/react-markdown — API, components, skipHtml, defaultUrlTransform, compatibility and Security sections, read through official README/raw source.
- https://github.com/remarkjs/remark-gfm — default plugin export, supported extensions, compatibility and security boundaries.
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow — scroll containers and overflow behavior.
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length — dynamic/small viewport units and browser-chrome caveats.
- https://developer.chrome.com/docs/modern-web-guidance/guides/css/css-layout — intrinsic sizing and min-inline-size for long content.
- npm registry metadata via npm view, captured below; current local Node: v24.14.1.

## Registry evidence

```json
{
  "react-markdown": {
    "version": "10.1.0",
    "peerDependencies": {
      "@types/react": ">=18",
      "react": ">=18"
    },
    "license": "MIT"
  },
  "remark-gfm": {
    "version": "4.0.1",
    "license": "MIT"
  },
  "vitest": {
    "version": "5.1.0",
    "engines": {
      "node": "^22.12.0 || ^24.0.0 || >=26.0.0"
    },
    "peerDependencies": {
      "vite": "^6.4.0 || ^7.0.0 || ^8.0.0",
      "jsdom": "*",
      "happy-dom": "*",
      "@vitest/ui": "5.1.0",
      "@types/node": "^22.0.0 || >=24.0.0",
      "@edge-runtime/vm": "*",
      "@opentelemetry/api": "^1.9.0",
      "@vitest/coverage-v8": "5.1.0",
      "@vitest/browser-preview": "5.1.0",
      "@vitest/coverage-istanbul": "5.1.0",
      "@vitest/browser-playwright": "5.1.0",
      "@vitest/browser-webdriverio": "^5.0.0-beta.5 || >=5.0.0"
    },
    "license": "MIT"
  }
}
```
