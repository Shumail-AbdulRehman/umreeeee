# Averiq Platform design review

**v3 approved and implemented · 25 November 2026**

Open [the prototype](v3/index.html) in a browser. The preview runs directly from disk with sample data. It includes the overview, company directory, company details, audit history, and simulated company access changes.

| Screen | Interactive view | Screenshot |
| --- | --- | --- |
| Platform overview | [Overview](v3/index.html#overview) | [Desktop](v3/screenshots/overview-desktop.png) · [Mobile](v3/screenshots/overview-mobile.png) |
| Company directory | [Companies](v3/index.html#companies) | [Desktop](v3/screenshots/companies-desktop.png) |
| Company detail | [Northstar Labs](v3/index.html#company/northstar) | [Desktop](v3/screenshots/company-desktop.png) |
| Audit log | [Audit log](v3/index.html#audit) | [Desktop](v3/screenshots/audit-desktop.png) |
| Company access dialog | [Open Northstar Labs and select Suspend company](v3/index.html#company/northstar) | [Dialog](v3/screenshots/access-dialog.png) |

A local HTTP preview is available on port 5191 while the review server is running. To start it again, run `python3 -m http.server 5191 --bind 127.0.0.1 --directory design/platform-owner/v3` from the repository root.

## Design stages

- [v1 layout](v1/NOTES.md) applies gpt-taste to the portfolio, investigation area, and company comparison table.
- [v2 motion](v2/NOTES.md) applies animate to button feedback and the native access dialog.
- [v3 polish](v3/NOTES.md) applies impeccable to the rendered screens, interactions, and responsive layout.

The user approved v3 for implementation on 25 November 2026. The implemented React workspace lives in `Frontend/src/features/platform/` and opens at `#platform-overview` for Super Admin accounts. Runtime API data replaces prototype sample data. See [implementation verification](../../docs/planning/platform-owner/implementation-verification.md) for test results and application screenshots.
