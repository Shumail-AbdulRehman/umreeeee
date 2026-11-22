import { Pagination } from '../../components/Surface.jsx'
import { evidenceSourceLabel, notScored, verdictLabel } from './labels.js'
import './red-team.css'

// Verdict chips. `value` is the filters.verdict value sent to onFilterChange:
// '' = All, 'control' = case_kind control (spec 21 maps it to case_kind=control).
const VERDICT_CHIPS = [
  { value: '', label: 'All', count: 'all' },
  { value: 'fail', label: 'Unsafe', count: 'unsafe' },
  { value: 'pass', label: 'Defended', count: 'defended' },
  { value: 'inconclusive', label: 'Inconclusive', count: 'inconclusive' },
  { value: 'error', label: 'Errors', count: 'errors' },
  { value: 'control', label: 'Controls', count: 'controls' },
]

const EVIDENCE_OPTIONS = [['', 'Any evidence'], ['policy', 'Policy block'], ['exact', 'Exact evidence'], ['judge', 'LLM judge']]

const option = (entry) => (typeof entry === 'string' ? { id: entry, name: entry } : { id: entry.id, name: entry.name ?? entry.id })

export function VerdictBadge({ verdict, source, control }) {
  const view = verdictLabel(verdict, { verdict_source: source, control })
  return <span className={`rt-badge rt-badge-sm rt-tone-${view.tone}${view.judged ? ' rt-judged' : ''}`}>
    {view.missing ? <><span aria-hidden="true">–</span><span className="rt-sr-only">{notScored}</span></> : view.label}
  </span>
}

export default function ResultsTable({
  items = [], counts = {}, filters = {}, plugins = [], strategies = [],
  page = 1, pageSize = 20, total = 0, onFilterChange, onPageChange, onView,
}) {
  const change = (patch) => onFilterChange?.({ verdict: '', plugin: '', strategy: '', evidence: '', ...filters, ...patch })
  const select = (label, key, allLabel, entries) => <label>
    <span className="rt-sr-only">{label}</span>
    <select value={filters[key] || ''} onChange={(event) => change({ [key]: event.target.value })}>
      <option value="">{allLabel}</option>
      {entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
    </select>
  </label>
  return <section className="rt-panel" aria-labelledby="rt-results-title">
    <div className="rt-panel-head" style={{ flexWrap: 'wrap', gap: 12 }}>
      <h2 id="rt-results-title" className="rt-panel-title">Results</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {select('Plugin', 'plugin', 'All plugins', plugins.map(option))}
        {select('Strategy', 'strategy', 'All strategies', strategies.map(option))}
        <label>
          <span className="rt-sr-only">Evidence</span>
          <select value={filters.evidence || ''} onChange={(event) => change({ evidence: event.target.value })}>
            {EVIDENCE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
    </div>
    <div role="group" aria-label="Verdict" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 18px' }}>
      {VERDICT_CHIPS.map((chip) => <button key={chip.label} type="button" className="rt-chip rt-press" aria-pressed={(filters.verdict || '') === chip.value} onClick={() => change({ verdict: chip.value })}>
        {chip.label} <span className="rt-num">{counts[chip.count] ?? 0}</span>
      </button>)}
    </div>
    <div className="rt-table-region" role="region" tabIndex={0} aria-labelledby="rt-results-title">
      <table className="rt-table">
        <thead><tr>
          <th className="rt-num">#</th><th>Plugin</th><th>Verdict</th><th>Strategy</th><th>Evidence</th>
          <th><span className="rt-sr-only">Details</span></th>
        </tr></thead>
        <tbody>
          {items.map((item) => {
            const number = item.attack_index + 1
            const evidence = item.evidence || (item.verdict_source && item.verdict_source !== 'none' ? evidenceSourceLabel(item.verdict_source).label : '')
            return <tr key={item.id}>
              <td data-label="#" className="rt-num">{number}</td>
              <td data-label="Plugin"><strong>{item.plugin_name}</strong></td>
              <td data-label="Verdict"><VerdictBadge verdict={item.verdict} source={item.verdict_source} control={item.case_kind === 'control'} /></td>
              <td data-label="Strategy">{item.strategy_name}</td>
              <td data-label="Evidence">{evidence || <><span aria-hidden="true">–</span><span className="rt-sr-only">No evidence recorded</span></>}</td>
              <td data-label="Details"><button type="button" className="rt-chip rt-press" aria-label={`View attack ${number}`} onClick={(event) => onView?.(item.id, { input: event.detail ? 'pointer' : 'keyboard' })}>View</button></td>
            </tr>
          })}
        </tbody>
      </table>
      {items.length === 0 && <p className="rt-empty">No results match these filters.</p>}
    </div>
    <Pagination page={page} pageSize={pageSize} total={total} onPageChange={(next) => onPageChange?.(next)} noun="results" />
  </section>
}
