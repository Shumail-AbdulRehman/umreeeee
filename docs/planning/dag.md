# Dependency evidence

- 00 consumes the inspected incumbent and approved design: approved architecture and decisions.
- 01 consumes 00: approved architecture and decisions.
- 02 consumes 01: test harness and dependencies.
- 03 consumes 01: test harness and dependencies.
- 04 consumes 01: test harness and dependencies.
- 05 consumes 01: test harness and dependencies.
- 06 consumes 02, 03, 04, 05: controlled components and their contracts.
- 07 consumes 01, 02, 03, 04, 05, 06: explicit whole-plan verification artifacts.
- 08 consumes 00, 01, 02, 03, 04, 05, 06, 07: explicit whole-plan verification artifacts.
