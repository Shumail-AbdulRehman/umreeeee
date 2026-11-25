"""Parse and validate bounded staff CSV payloads before their use in a transaction."""

import csv
import io
import re
from collections import Counter

from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.staff_import import ImportIssue, StaffImportRow
from app.schemas.users import ManagedUserCreateRequest
from app.utils.normalizers import normalize_department_name, normalize_email, normalize_person_name, validate_email


MAX_BYTES = 256 * 1024
MAX_ROWS = 100
COLUMNS = ('first_name', 'last_name', 'email', 'department')
LABELS = {'first_name': 'First name', 'last_name': 'Last name', 'email': 'Email', 'department': 'Department'}
EMAIL_SHAPE = re.compile(r"[^\s@<>(),;:\\\"\x00-\x1f\x7f]+@[^\s@<>(),;:\\\"\x00-\x1f\x7f]+\.[^\s@<>(),;:\\\"\x00-\x1f\x7f]+")


def file_issue(code, reason, fix, row=None, field=None):
    return [], [ImportIssue(row=row, field=field, code=code, reason=reason, fix=fix)]


def parse_staff_csv(content):
    if len(content) > MAX_BYTES:
        return file_issue('file_too_large', 'The CSV exceeds 256 KB.', 'Split the file into smaller CSVs.')
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        return file_issue('invalid_encoding', 'The file is not valid UTF-8.', 'Save as UTF-8 CSV and try again.')
    if '\0' in text:
        return file_issue('invalid_csv', 'The file contains non-text data.', 'Save as UTF-8 CSV and try again.')
    if not text.strip():
        return file_issue('empty_file', 'The CSV is empty.', 'Add the template headers and at least one staff row.')

    reader = csv.reader(io.StringIO(text, newline=''), strict=True)
    try:
        names = [value.strip() for value in next(reader)]
    except (StopIteration, csv.Error):
        return file_issue('malformed_csv', 'The header row could not be read.', 'Check for unclosed quotes or use the template.', row=1)

    headers = Counter(names)
    issues = [
        ImportIssue(row=1, field=column, code='missing_header', reason=f'Missing required column: {column}.',
                    fix='Add the missing header or use the CSV template.')
        for column in COLUMNS if column not in headers
    ]
    issues.extend(
        ImportIssue(row=1, field=column, code='duplicate_header', reason=f'Column appears more than once: {column}.',
                    fix='Keep one copy of this column.')
        for column in COLUMNS if headers[column] > 1
    )
    if any(column not in COLUMNS for column in headers):
        issues.append(ImportIssue(row=1, code='unexpected_header', reason='The CSV has an extra or unnamed column.',
                                  fix='Keep only first_name, last_name, email and department.'))
    if issues:
        return [], issues

    rows = []
    first_seen = {}
    while True:
        line = reader.line_num + 1
        try:
            cells = next(reader)
        except StopIteration:
            break
        except csv.Error:
            return file_issue('malformed_csv', 'The CSV contains invalid quoting or an oversized value.',
                              'Close quoted values and put double quotes around values that contain commas.', row=line)
        if not cells or len(cells) == 1 and not cells[0].strip():
            continue
        if len(rows) >= MAX_ROWS:
            return file_issue('too_many_rows', 'The CSV has more than 100 staff rows.',
                              'Split the file into batches of up to 100 rows.', row=line)
        row = _parse_row(line, names, cells)
        if row.email and EMAIL_SHAPE.fullmatch(row.email) and len(row.email) <= 255:
            original = first_seen.setdefault(row.email, line)
            if original != line:
                row.issues.append(ImportIssue(
                    row=line, field='email', code='duplicate_in_file',
                    reason=f'Duplicate email in row {original}.', fix='Keep only one row for this address.',
                ))
        rows.append(row)
    if not rows:
        return file_issue('no_staff_rows', 'The CSV has headers only.', 'Add at least one staff row.')
    return rows, []


def _parse_row(line, names, cells):
    raw = dict(zip(names, cells))
    values = {
        'first_name': normalize_person_name(raw.get('first_name', '')),
        'last_name': normalize_person_name(raw.get('last_name', '')),
        'email': normalize_email(raw.get('email', '')),
        'department': normalize_department_name(raw.get('department', '')),
    }
    issues = []
    if len(cells) != len(COLUMNS):
        issues.append(ImportIssue(row=line, code='row_width',
                                  reason=f'Expected 4 values, found {len(cells)}.',
                                  fix='Check the commas and put quotes around values containing a comma.'))
    invalid_fields = set()
    try:
        ManagedUserCreateRequest(**values, role='user')
    except ValidationError as exc:
        for error in exc.errors(include_input=False):
            field = error['loc'][0]
            label = LABELS[field]
            invalid_fields.add(field)
            reason = f'{label} is required.' if not values[field] else f'{label} has an invalid length.'
            length = error['ctx']
            fix = (f'Use at least {length["min_length"]} characters.' if 'min_length' in length
                   else f'Use no more than {length["max_length"]} characters.')
            issues.append(ImportIssue(row=line, field=field, code=error['type'], reason=reason, fix=fix))
    if 'email' not in invalid_fields:
        try:
            validate_email(values['email'])
            if not EMAIL_SHAPE.fullmatch(values['email']):
                raise ValueError
        except (HTTPException, ValueError):
            issues.append(ImportIssue(row=line, field='email', code='invalid_email',
                                      reason='Invalid email address.', fix='Use an address like name@example.com.'))
    # Echo bounded display fields even for rejected malformed values.
    return StaffImportRow(row=line, issues=issues, **{key: value[:255] for key, value in values.items()})
