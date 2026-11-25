# Platform dependency graph

- 00 consumes existing tree: Platform implementation decisions
- 01 consumes 0: Strict platform HTTP contracts
- 02 consumes 1: Platform aggregate read models
- 03 consumes 2: Overview and company read orchestration
- 04 consumes 1: Safe audit and company access lifecycle
- 05 consumes 1, 3, 4: Platform route composition
- 06 consumes 1: Platform API client and request lifecycle
- 07 consumes 0: Platform shell, tokens and shared presentation
- 08 consumes 6, 7: Platform overview screen
- 09 consumes 6, 7: Company directory screen
- 10 consumes 6, 7: Company detail and access dialog
- 11 consumes 6, 7: Platform audit screen
- 12 consumes 8, 9, 10, 11: Application routing and workspace entry
- 13 consumes 5, 12: Platform workflow and responsive acceptance
- 14 consumes 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13: Platform final verification and reuse audit
