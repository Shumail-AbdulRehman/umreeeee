export const CSV_COLUMNS = ['first_name', 'last_name', 'email', 'department']
export const MAX_CSV_BYTES = 256 * 1024

export const issueFields = {
  first_name: 'First name', last_name: 'Last name', email: 'Email', department: 'Department',
}

export function downloadCsv(filename, rows) {
  const csv = rows.map(row => row.map(value => {
    const text = String(value ?? '')
    const safe = /^[\s]*[=+\-@]|^[\t\r\n]/.test(text) ? `'${text}` : text
    return `"${safe.replaceAll('"', '""')}"`
  }).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv, '\r\n'], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
