# Staff Import design brief

Company admins use Users → Import staff to invite a group from a CSV in one operation. The interface uses the Averiq workspace shell, the existing Inter typography and a quiet violet accent. This is a daily admin task, so the file and the next action lead each screen.

The three steps are Upload CSV, Review rows, and Import complete. Review shows row numbers, field names, what went wrong, and a way to download the issues or replace the file. A separate file-level error shows structured recovery for broken files. Every row must pass before the import action is available. Clear validation never sends an invitation. Successful import shows accounts created and invitation delivery as separate outcomes.

The sample workbook has first_name, last_name, email and department columns. Regular staff only, no passwords or role changes. The demo uses local files and synthetic data to illustrate the workflow. Production React components will use the existing Users and invitation boundaries.
