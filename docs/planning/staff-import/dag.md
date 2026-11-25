# Draft Staff Import dependency graph

`00 → 01, 02, 05`. Parsing and persistence consume the contract. UI consumes the same contract and approved v3 reference.

`02 → 03`. Delivery consumes durable jobs and atomic receipt creation.

`01, 02 → 04`. The route adapter consumes validation and persistence.

`04, 05 → 06`. The Users entry consumes routes and UI components.

`03, 06 → 07 → 08`. Browser and database acceptance exercise the complete operation, then the final gate verifies it.
