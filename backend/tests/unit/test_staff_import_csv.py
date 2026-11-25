import pytest

from app.services.staff_import_csv import MAX_BYTES, parse_staff_csv


HEADER = b'first_name,last_name,email,department\n'


def test_normalizes_staff_and_uses_physical_line_numbers():
    rows, issues = parse_staff_csv(
        b'\xef\xbb\xbfdepartment,last_name,email,first_name\r\n'
        b'"Design, Research",Shah,MAya@example.com, Maya \r\n'
        b'\r\n"Service\r\nDesk",Park,elena@example.com,Elena\r\n'
        b'Operations,Smith,ian@example.com,Ian'
    )
    assert not issues
    assert [row.row for row in rows] == [2, 4, 6]
    assert rows[0].email == 'maya@example.com'
    assert rows[0].department == 'Design, Research'
    assert rows[1].department == 'Service Desk'
    assert not any(row.issues for row in rows)


def test_pinpoints_bad_values_and_duplicate_email():
    rows, errors = parse_staff_csv(HEADER +
        b'Maya,Shah,maya@example.com,Operations\n'
        b'Ian,Smith, Maya@EXAMPLE.com ,\n'
        b'Elena,Park,not an email,Design\n'
        b'Jon,Nash,jon@example.com,Legal,extra\n'
    )
    assert not errors
    assert [issue.code for issue in rows[1].issues] == ['string_too_short', 'duplicate_in_file']
    assert rows[1].issues[1].reason == 'Duplicate email in row 2.'
    assert rows[2].issues[0].field == 'email'
    assert rows[2].issues[0].code == 'invalid_email'
    assert rows[3].issues[0].code == 'row_width'


@pytest.mark.parametrize('data,code', [
    (b'', 'empty_file'), (b'\xff', 'invalid_encoding'), (b'\x00csv', 'invalid_csv'),
    (HEADER, 'no_staff_rows'),
    (b'first_name,last_name,email\n', 'missing_header'),
    (HEADER.rstrip() + b',department\n', 'duplicate_header'),
    (HEADER.rstrip() + b',role\n', 'unexpected_header'),
    (HEADER + b'Maya,Shah,maya@example.com,"Support', 'malformed_csv'),
    (b'a' * (MAX_BYTES + 1), 'file_too_large'),
    (HEADER + b'Maya,Shah,maya@example.com,Operations\n' * 101, 'too_many_rows'),
])
def test_file_error_has_a_reason_and_recovery(data, code):
    rows, issues = parse_staff_csv(data)
    assert not rows
    assert issues[0].code == code and issues[0].reason and issues[0].fix
