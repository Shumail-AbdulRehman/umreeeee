# Platform design system

Source: design/platform-owner/v3 (approved by implementation request 2026-11-25).

## Tokens

```css
:root {
  color-scheme: light;
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  color: #1e1a2b;
  background: #f6f5f9;
  --canvas: #f6f5f9;
  --paper: #fff;
  --ink: #1e1a2b;
  --muted: #625b71;
  --line: #e5e1ed;
  --strong-line: #d8d2e3;
  --violet: #593ab9;
  --violet-dark: #482d9e;
  --violet-soft: #efeafa;
  --side: #211d2d;
  --side-line: #3b3449;
  --side-muted: #bcb4ce;
  --green: #22634c;
  --green-soft: #e8f5ee;
  --amber: #84500b;
  --amber-soft: #fff2dc;
  --rose: #a33353;
  --rose-soft: #fcecf1;
  --blue: #325f96;
  --blue-soft: #eaf1fd;
  --chart-allow: #7154d7;
  --chart-block: #d69457;
  --chart-other: #a6a5ba;
  --radius: 12px;
  --control-radius: 8px;
  --sidebar-width: 232px;
  font-variant-numeric: tabular-nums;
}
```

Scope these tokens under the platform feature to avoid altering organization UI. Additional v3 sidebar, table, hover, focus, dialog-overlay and chart spark values are transcribed into scoped semantic tokens when needed.

## Layout
232px graphite sidebar, 62px header, 32px content gutters, 33px heading, 12px surface radius, 8px controls; 4-column metric strip, investigation grid 1.65:1, full-width company table. At 960px use two metric columns and one investigation column; at720px show keyboard-accessible mobile navigation and14px gutters.

## States and motion
Preserve v3 violet, green, amber, rose, blue semantics with text. Buttons use140ms transform feedback and dialogs200ms ease-out; respect reduced motion. No chart entry animation. Loading, errors and empty states use the same surfaces. Radix Dialog supplies focus management. Charts include data tables.
