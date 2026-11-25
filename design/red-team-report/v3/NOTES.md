# v3 report design

Chart panels share their borders and vertical alignment on wide screens, and stack on phones. The outcomes show count labels alongside the proportion bar and keep the 80% defense target close to the measured defense rate. Plugin risk bars use a common 0–10 scale. The full-width breakdown retains per-plugin paired rates as secondary evidence. Small screens display paired context and outcome counts beneath each plugin name.

The audit caught small metadata text, insufficient top-bar inset and an invalid definition-list structure. The final revision corrects these. The source detector flags the use of Inter, which follows the fixed Averiq design system. The local prototype falls back to the system font when Inter is unavailable.

Chromium checked layout at 320, 390, 768, 1024 and 1440 pixels. Axe found no issues in its WCAG-tagged rules at 390 and 1440 pixels. Keyboard tabs, paired view switching, the framework picker, outcome filtering, and CSV download were exercised. The preview used sample data and made zero network requests.
