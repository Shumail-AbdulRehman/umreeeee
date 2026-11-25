# Platform browser acceptance reuse

- Frontend/playwright.platform.config.js: strict isolated production preview on5193 using installed Chrome.
- Frontend/tests/fixtures/platform-api.js: test-only12-company data matching v3 counts and weekly volume, UTC time fixed for screenshots; optional error, conflict, external-state-change and pagination states; every API request recorded and all unexpected requests rejected.
- Frontend/tests/platform-owner.spec.js: default entry/login,7/30-day overview, directory, detail, reasoned access lifecycle, three conflict/recovery paths, own-company protection, audit filters/pagination/search, workspace return, both role denials,1440/390px Axe/overflow/focus checks.
- docs/planning/platform-owner/screenshots/: six final production-browser screenshots for review against approved v3.

No sample records are imported into runtime code and no real provider calls occur.

Final browser coverage also includes failed conflict refresh recovery, already-applied state protection, post-mutation focus, mobile current-link focus, browser-Back date state and all-screen320/768/1024px overflow. Screenshots are captured in the desktop/mobile acceptance tests so every final artifact comes from the same production build.
