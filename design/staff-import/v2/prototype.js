const $ = (id) => document.getElementById(id)
const columns = ['first_name','last_name','email','department']
const header = columns.join(',')
const readySample = [
  'Maya,Shah,maya.shah@example.com,Operations',
  'Daniel,Reyes,daniel.reyes@example.com,Engineering',
  'Hana,Kim,hana.kim@example.com,Support',
  'Amir,Khan,amir.khan@example.com,Finance',
  'Elena,Park,elena.park@example.com,Design',
]
const errorSample = [
  readySample[0],
  'Daniel,Reyes,daniel.reyes,Engineering',
  'Hana,Kim,maya.shah@example.com,Support',
  'Amir,Khan,amir.khan@example.com,',
  readySample[4],
]
let employees = []
let filename = ''
let revision = 0
let sampleDeliveryFailure = false
const html = (text) => String(text ?? '').replace(/[&<>"']/g, (value) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[value])
const plural = (count, one, many = one + 's') => `${count} ${count === 1 ? one : many}`

function enter(step) {
  for (const state of ['upload', 'review', 'complete']) $(state).hidden = step !== state
  const steps = ['upload', 'review', 'complete']
  document.querySelectorAll('.steps li').forEach((item, index) => {
    if (steps[index] === step) item.setAttribute('aria-current', 'step')
    else item.removeAttribute('aria-current')
    item.classList.toggle('done', index < steps.indexOf(step))
  })
  $(step).querySelector('h2').focus({preventScroll:true})
  window.scrollTo(0, 0)
}

function parseCsv(text) {
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const cell = /(?:"((?:[^"]|"")*)"|([^",\n]*))(,|\n|$)/y
  const result = []
  let fields = [], line = 1, firstLine = 1
  while (cell.lastIndex < source.length || source.endsWith(',') && fields.length) {
    const entry = cell.exec(source)
    if (!entry) throw Error(`CSV row ${line} has invalid quoting. Close the quoted value and save the file again.`)
    const [, quoted, bare, separator] = entry
    fields.push((quoted?.replaceAll('""','"') ?? bare).trim())
    line += entry[0].split('\n').length - 1
    if (separator === ',') continue
    if (fields.some(Boolean) || fields.length > 1) result.push({ line:firstLine, fields })
    firstLine = line
    fields = []
  }
  return result
}

function preview(text, name, sampleFailure = false) {
  $('file-error').hidden = true
  sampleDeliveryFailure = sampleFailure
  try {
    const [head, ...records] = parseCsv(text)
    if (!head) throw Error('The file is empty. Add the header and at least one staff row.')
    const missing = columns.filter((field) => !head.fields.includes(field))
    const extra = head.fields.filter((field) => !columns.includes(field))
    if (new Set(head.fields).size < head.fields.length) throw Error('A column name appears more than once. Keep one of each required column.')
    if (missing.length) throw Error(`Missing required ${missing.length === 1 ? 'column' : 'columns'}: ${missing.join(', ')}. Add the missing header or download the template.`)
    if (extra.length) throw Error(`Unexpected ${extra.length === 1 ? 'column' : 'columns'}: ${extra.join(', ')}. Use only the four template columns.`)
    if (records.length === 0) throw Error('The CSV has headers only. Add at least one staff row.')
    if (records.length > 100) throw Error('This file exceeds 100 staff rows. Split it into smaller files.')
    const seen = new Map()
    employees = records.map(({ line, fields }) => {
      const values = Object.fromEntries(columns.map((key) => [key, fields[head.fields.indexOf(key)] ?? '']))
      const issues = []
      const email = values.email.toLowerCase()
      const firstSeen = seen.get(email)
      if (fields.length !== columns.length) issues.push(['Row', `Expected 4 values, found ${fields.length}`, 'Check commas and quote any value that contains a comma.'])
      for (const [key, label, max] of [['first_name','First name',120],['last_name','Last name',120],['department','Department',160]]) {
        const size = [...values[key]].length
        if (size < 2 || size > max) issues.push([label, size === 0 ? `${label} is required` : `${label} has an invalid length`, `Enter ${label.toLowerCase()} with 2–${max} characters.`])
      }
      if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        issues.push(['Email', 'Invalid email address', 'Enter a valid address, such as name@example.com.'])
      } else if (firstSeen) {
        issues.push(['Email', `Duplicate email in row ${firstSeen}`, 'Keep one row for this address.'])
      } else {
        seen.set(email, line)
      }
      if (email === 'existing@example.com') issues.push(['Email', 'Email is already registered', 'Remove this row or use the correct address.'])
      return { line, name:`${values.first_name} ${values.last_name}`.trim(), email, department:values.department, issues }
    })
    filename = name
    $('issues-only').checked = false
    renderReview()
    enter('review')
  } catch (error) {
    enter('upload')
    $('file-error').innerHTML = `<strong>We couldn’t read this CSV</strong><p>${html(error.message)}</p>`
    $('file-error').hidden = false
  }
}

function renderReview() {
  const blocked = employees.filter((row) => row.issues.length).length
  const ready = employees.length - blocked
  const notice = $('validation-message')
  const rows = employees.filter((row) => !$('issues-only').checked || row.issues.length)
  notice.className = `notice ${blocked ? 'problem' : 'success'}`
  notice.innerHTML = blocked
    ? `<strong>Fix ${plural(blocked, 'row')} to continue</strong><p>Correct the rows in your CSV and replace the file. Every row must pass before importing.</p>`
    : '<strong>All rows passed validation</strong><p>Confirm the import to create staff accounts and start sending invitations.</p>'
  $('review-file').textContent = `${filename} · ${plural(employees.length, 'staff row')}`
  $('record-count').textContent = `${ready} ready · ${blocked} with issues`
  $('confirm-import').textContent = blocked ? 'Import staff' : `Import ${employees.length} staff`
  $('confirm-import').disabled = blocked > 0
  $('issues-download').hidden = blocked === 0
  $('issues-only').closest('label').hidden = blocked === 0
  $('rows').innerHTML = rows.map((row) => `<tr>
    <td data-label="CSV row">${row.line}</td><td data-label="Employee"><strong>${html(row.name || 'Unnamed employee')}</strong><small>${html(row.email || 'Email missing')}</small></td>
    <td data-label="Department">${html(row.department || '—')}</td><td data-label="Validation result">${row.issues.length ? row.issues.map(([field, reason, action]) => `<div class="issue"><span class="row-problem">${html(field)} · ${html(reason)}</span><small>${html(action)}</small></div>`).join('') : '<span class="state">Ready</span>'}</td>
  </tr>`).join('')
}

async function load(file) {
  const current = ++revision
  if (!file) return
  $('file-error').hidden = true
  const button = $('drop-zone').querySelector('label')
  button.textContent = 'Checking CSV…'
  try {
    if (!file.name.toLowerCase().endsWith('.csv')) throw Error('Choose a .csv file. In your spreadsheet, use Save as CSV.')
    if (file.size > 256 * 1024) throw Error('This file exceeds 256 KB. Split it into smaller CSV files.')
    const bytes = await file.arrayBuffer()
    if (current !== revision) return
    let text
    try { text = new TextDecoder('utf-8', {fatal:true}).decode(bytes) }
    catch { throw Error('Save the spreadsheet as UTF-8 CSV, then choose it again.') }
    preview(text, file.name)
  } catch (error) {
    if (current !== revision) return
    enter('upload')
    $('file-error').innerHTML = `<strong>Upload couldn’t be checked</strong><p>${html(error.message)}</p>`
    $('file-error').hidden = false
  } finally {
    if (current === revision) button.textContent = 'Choose CSV file'
  }
}

$('file').addEventListener('change', (event) => {
  const file = event.target.files[0]
  event.target.value = ''
  if (file) load(file)
})
for (const type of ['dragover','dragleave','drop']) {
  $('drop-zone').addEventListener(type, (event) => {
    event.preventDefault()
    $('drop-zone').classList.toggle('drag', type === 'dragover')
    if (type === 'drop' && event.dataTransfer.files[0]) load(event.dataTransfer.files[0])
  })
}
document.querySelectorAll('[data-demo]').forEach((button) => button.addEventListener('click', () => {
  revision += 1
  $('drop-zone').querySelector('label').textContent = 'Choose CSV file'
  if (button.dataset.demo === 'invalid') {
    preview('first_name,last_name,email\nMaya,Shah,maya.shah@example.com', 'staff-incomplete.csv')
  } else if (button.dataset.demo === 'errors') {
    preview([header, ...errorSample].join('\n'), 'staff-november.csv')
  } else {
    preview([header, ...readySample].join('\n'), 'staff-november-fixed.csv', true)
  }
}))
$('issues-only').addEventListener('change', renderReview)
$('replace').addEventListener('click', () => $('file').click())
$('another').addEventListener('click', () => { $('file-error').hidden = true; enter('upload') })
$('issues-download').addEventListener('click', () => {
  const csvCell = (text) => '"' + String(text).replaceAll('"','""') + '"'
  const rows = employees.flatMap((row) => row.issues.map((issue) => [row.line, ...issue]))
  const contents = ['row,field,reason,how_to_fix', ...rows.map((row) => row.map(csvCell).join(','))].join('\r\n')
  const href = URL.createObjectURL(new Blob([contents], {type:'text/csv'}))
  const link = document.createElement('a')
  link.href = href
  link.download = 'staff-import-issues.csv'
  link.click()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
})
$('confirm-import').addEventListener('click', () => {
  if (!employees.length || employees.some((row) => row.issues.length)) return
  const failures = Number(sampleDeliveryFailure)
  $('receipt-file').textContent = `${filename} · Preview receipt`
  $('receipt-metrics').innerHTML = [
    ['Accounts created',employees.length],
    ['Invitations sent',employees.length - failures],
    ['Needs attention',failures],
  ].map(([label,count]) => `<div><dt>${label}</dt><dd>${count}</dd></div>`).join('')
  $('receipt-rows').innerHTML = employees.map((row, index) => {
    const failed = sampleDeliveryFailure && index === employees.length - 1
    return `<tr><td data-label="Employee"><strong>${html(row.name)}</strong><small>${html(row.email)}</small></td>
      <td data-label="Department">${html(row.department)}</td><td data-label="Invitation delivery"><span class="state${failed ? ' problem' : ''}">${failed ? 'Delivery failed' : 'Sent'}</span></td></tr>`
  }).join('')
  $('delivery-note').hidden = !failures
  enter('complete')
})
