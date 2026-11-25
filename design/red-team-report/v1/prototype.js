const plugins = [
  ['Resource Hijacking', 9, 'worked'],
  ['Disinformation Campaigns', 8, 'worked'],
  ['Entity Impersonation', 7, 'worked'],
  ['Overreliance', 7, 'worked'],
  ['Command Injection', 0, 'defended'],
  ['Excessive Agency', 0, 'defended'],
  ['Hallucination', 0, 'defended'],
  ['Hate Speech', 0, 'defended'],
  ['PII via API/Database', 0, 'defended'],
  ['Prompt Extraction', 0, 'defended'],
  ['Personal Data Disclosure', 0, 'defended'],
  ['Unauthorized Advice', 0, 'defended'],
  ['Access Boundaries', 0, 'defended'],
  ['Unintended Disclosure', null, 'error'],
]
const statusNames = { worked:'Worked', defended:'Defended', error:'Error', pending:'Pending' }
const $ = (id) => document.getElementById(id)
let paired = false

function draw() {
  const active = plugins.map(([name, risk, status], index) => ({
    name,
    risk: paired ? (index % 5 === 4 ? null : 0) : risk,
    status: paired ? (index % 5 === 4 ? 'error' : 'defended') : status,
  }))
  const totals = Object.fromEntries(Object.keys(statusNames).map((status) => [
    status, active.filter((row) => row.status === status).length,
  ]))
  const decided = totals.worked + totals.defended
  const rate = ((totals.worked / decided) * 100).toFixed(1)
  $('run-mode').textContent = paired ? 'With policies' : 'Raw model'
  $('pair').innerHTML = `Open ${paired ? 'raw' : 'paired'} run <span aria-hidden="true">↗</span>`
  $('overall-risk').textContent = paired ? '0.0' : '9.5'
  $('risk-level').hidden = paired
  $('risk-context').textContent = paired ? 'Zero successful attacks' : '4 plugins with successful attacks'
  $('attack-rate').textContent = `${rate}%`
  $('rate-context').textContent = `${totals.worked} of ${decided} decided cases worked`
  $('decided-count').textContent = decided
  $('decided-context').textContent = `${totals.error} ${totals.error === 1 ? 'case' : 'cases'} returned an error`
  $('outcome-track').innerHTML = Object.entries(totals).filter(([, count]) => count > 0).map(([status, count]) =>
    `<span class="segment ${status}" style="flex:${count}"></span>`).join('')
  $('outcome-legend').innerHTML = Object.entries(totals).map(([status, count]) =>
    `<li><span class="legend-dot ${status}" aria-hidden="true"></span><span>${statusNames[status]}</span><strong>${count}</strong></li>`).join('')
  const highest = active.filter(({ risk }) => risk > 0).slice(0, 4)
  $('risk-list').innerHTML = highest.length ? highest.map(({ name, risk }) => `
    <div class="risk-row"><span>${name}</span><span class="risk-track" aria-hidden="true"><i class="${risk >= 9 ? 'critical' : ''}" style="width:${risk * 10}%"></i></span><strong class="risk-score">${risk.toFixed(1)}</strong></div>`
  ).join('') + '<div class="risk-axis" aria-hidden="true"><div><span>0</span><span>5</span><span>10</span></div></div>' : '<p class="muted">No plugin recorded a positive risk score.</p>'
  $('plugin-rows').innerHTML = active.map(({ name, risk, status }) => {
    const outcome = status === 'error' ? 'Not scored' : status === 'worked' ? '100.0%' : '0.0%'
    const detail = status === 'error' ? '1 error' : status === 'worked' ? '1 worked' : '1 defended'
    return `<tr><th scope="row">${name}<small class="mobile-detail muted">${detail}</small></th><td>${risk === null ? '—' : risk.toFixed(1)}</td><td>${outcome}</td><td class="outcomes-column"><span class="badge ${status}">${detail}</span></td><td class="strategy-column muted">${status === 'worked' ? 'Baseline Testing' : '—'}</td></tr>`
  }).join('')
  $('strategy-rows').innerHTML = `<tr><th scope="row">Baseline Testing</th><td>${rate}%</td><td>${totals.worked} worked · ${totals.defended} defended · ${totals.error} ${totals.error === 1 ? 'error' : 'errors'}</td></tr>`
  drawResults(active)
  drawCoverage()
  return active
}

function drawResults(active) {
  const filter = $('result-filter').value
  $('case-rows').innerHTML = active.map((row, i) => ({ ...row, number:i+1 }))
    .filter((row) => !filter || row.status === filter).map(({ name, status, number }) =>
      `<tr><th scope="row">${number}</th><td>${name}</td><td><span class="badge ${status}">${statusNames[status]}</span></td></tr>`).join('')
    || '<tr><td colspan="3">No cases match this outcome.</td></tr>'
}

function drawCoverage() {
  const counts = $('framework').selectedIndex === 0 ? (paired ? [4, 0, 6] : [3, 3, 4]) : (paired ? [8, 0, 13] : [6, 4, 11])
  $('coverage-strip').innerHTML = ['Passed', 'Failed', 'Not tested'].map((label, index) => `<div><strong>${counts[index]}</strong><span>${label}</span></div>`).join('')
}

const tabs = [...document.querySelectorAll('[role="tab"]')]
for (const tab of tabs) {
  tab.addEventListener('click', () => activate(tab))
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs.find((entry) => entry !== tab)
    activate(next)
    next.focus()
  })
}
function activate(selected) {
  for (const tab of tabs) {
    const active = tab === selected
    tab.setAttribute('aria-selected', active)
    tab.tabIndex = active ? 0 : -1
    $(tab.getAttribute('aria-controls')).hidden = !active
  }
}

$('pair').addEventListener('click', () => {
  paired = !paired
  draw()
})
$('framework').addEventListener('change', drawCoverage)
$('result-filter').addEventListener('change', draw)
for (const button of document.querySelectorAll('[data-export]')) {
  button.addEventListener('click', () => {
    const format = button.dataset.export
    const details = button.closest('details')
    details.open = false
    details.querySelector('summary').focus()
    if (format === 'print') {
      window.print()
      return
    }
    const rows = draw()
    const text = format === 'csv' ? ['plugin,risk,outcome', ...rows.map(({ name, risk, status }) => `${name},${risk ?? ''},${status}`)].join('\n') : JSON.stringify({ preview: true, rows }, null, 2)
    const href = URL.createObjectURL(new Blob([text], { type: format === 'csv' ? 'text/csv' : 'application/json' }))
    const link = document.createElement('a')
    link.href = href
    link.download = `averiq-sample-report.${format}`
    link.click()
    setTimeout(() => URL.revokeObjectURL(href), 1000)
  })
}
draw()
