# Inventory fragment: spec 20 read-side queries

Added by spec 20: `backend/app/services/red_team_queries_v3.py`.

- `results(db, test, page=1, page_size=20, filters=None)`: paginated jobs, whole-test counts; filters plugin/strategy/verdict/verdict_source/case_kind/state. Counts exclude controls and cancelled rows from verdict chips.
- `result_detail(db, test, job)`: returns `{result}`, using incumbent `job_read` retention/decryption; adds names, original prompt, source, evidence_steps, judge, optional decoded_response, paired verdict. Worker writes `evidence_steps` (also accepts `steps`).
- `report(db, test)`: serialized v3 report plus reproducibility metadata, progress and test. Pairing is tenant/group/hash scoped, opposite mode and newest terminal. Previous uses same target/mode/plugin and strategy sets before this finish time.
- `export_rows(db, test, csv=False)`: raw JSON DTOs without scenario_system; with `csv=True`, formula-safe strings limited to `CSV_COLUMNS`. JSON preserves original text. No ciphertext is returned.
- `read_job`, `filter_query`, `paired_test`, `previous_test`, `csv_safe`, `CSV_COLUMNS` support spec 22.
- Imports `job_read/test_read` from the service; spec 22 must import these query functions locally in service methods to avoid a module import cycle.
- Decoding: printable base64/hex candidates are displayed; mechanical ROT13/leet transforms require known marker evidence to avoid showing transformed ordinary prose.
