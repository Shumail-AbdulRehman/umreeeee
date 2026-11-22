import { useId } from 'react'
import { Pagination } from '../../components/Surface.jsx'
import { Button } from '../../components/ui/button.jsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.jsx'
import { formatNumber } from '../../lib/format.js'
import { evidenceSourceLabel, notScored, verdictLabel } from './labels.js'
import './red-team.css'

const VERDICT_CHIPS = [
  { value: '', label: 'All', count: 'all' },
  { value: 'fail', label: 'Unsafe', count: 'unsafe' },
  { value: 'pass', label: 'Defended', count: 'defended' },
  { value: 'pending', label: 'Pending', count: 'pending' },
  { value: 'error', label: 'Errors', count: 'errors' },
]
const LEGACY_VERDICT_CHIPS = [
  ...VERDICT_CHIPS.filter((chip) => chip.value !== 'pending'),
  { value: 'inconclusive', label: 'Inconclusive', count: 'inconclusive' },
  { value: 'control', label: 'Controls', count: 'controls' },
]
const SOURCE_OPTIONS = ['policy', 'grader', 'none'].map((id) => ({ id, name: evidenceSourceLabel(id).label }))
const LEGACY_SOURCE_OPTIONS = ['policy', 'exact', 'judge'].map((id) => ({ id, name: evidenceSourceLabel(id).label }))
const HEADERS = ['#', 'Plugin', 'Verdict', 'Strategy', 'Source', 'Details']

function FilterSelect({ label, allLabel, entries, value, onChange }) {
  return <label className="min-w-0 max-w-full">
    <span className="rt-sr-only">{label}</span>
    <select className="h-8 max-w-full rounded-[7px] border border-[var(--rt-line)] bg-[var(--rt-surface)] px-2 text-xs text-[var(--rt-ink-secondary)]"
      value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{allLabel}</option>
      {entries.map((entry) => {
        const { id, name } = typeof entry === 'string' ? { id: entry } : entry
        return <option key={id} value={id}>{name ?? id}</option>
      })}
    </select>
  </label>
}

export function VerdictBadge({ verdict, source, control }) {
  const view = verdictLabel(verdict, { verdict_source: source, control })
  return <span className={`rt-badge rt-badge-sm rt-tone-${view.tone}${view.judged ? ' rt-judged' : ''}`}>
    {view.missing ? <><span aria-hidden="true">–</span><span className="rt-sr-only">{notScored}</span></> : view.label}
  </span>
}

function ResultRow({ item, onView }) {
  const index = item.test_idx ?? item.attack_index
  const number = index == null ? null : index + 1
  const repeat = item.repeat_index > 0 ? `repeat ${item.repeat_index + 1}` : ''
  const action = number == null ? 'View attack' : `View attack ${number}${repeat ? `, ${repeat}` : ''}`
  return <TableRow role="row">
    <TableCell role="cell" data-label="#" className="rt-num whitespace-normal">
      {number ?? '—'}{repeat && <small>{repeat}</small>}
    </TableCell>
    <TableCell role="cell" data-label="Plugin" className="whitespace-normal"><strong>{item.plugin_name || item.plugin_id || 'Unknown plugin'}</strong></TableCell>
    <TableCell role="cell" data-label="Verdict">
      <VerdictBadge verdict={item.verdict} source={item.verdict_source} control={item.case_kind === 'control'} />
    </TableCell>
    <TableCell role="cell" data-label="Strategy" className="whitespace-normal">{item.strategy_name || item.strategy_id || 'Unknown strategy'}</TableCell>
    <TableCell role="cell" data-label="Source" className="whitespace-normal">{evidenceSourceLabel(item.verdict_source ?? 'none').label}</TableCell>
    <TableCell role="cell" data-label="Details">
      <button type="button" className="rt-chip rt-press" aria-label={action} aria-haspopup="dialog" onClick={(event) => {
        event.currentTarget.focus()
        onView?.(item.id, { input: event.detail ? 'pointer' : 'keyboard' })
      }}>View</button>
    </TableCell>
  </TableRow>
}

// Filter changes use one callback. The controlling page applies the filters and resets to page 1 together.
export default function ResultsTable({
  items = [], counts = {}, filters = {}, plugins = [], strategies = [],
  page = 1, pageSize = 20, total = items.length, loading = false, error = false,
  onFilterChange, onPageChange, onView, onRetry,
}) {
  const titleId = useId()
  // The incumbent page uses evidence until spec 18 switches it to verdict_source.
  const legacyFilters = Object.hasOwn(filters, 'evidence') && !Object.hasOwn(filters, 'verdict_source')
  const sourceKey = legacyFilters ? 'evidence' : 'verdict_source'
  const emptyFilters = { plugin: '', strategy: '', verdict: '', [sourceKey]: '' }
  const active = {
    plugin: filters.plugin ?? '',
    strategy: filters.strategy ?? '',
    verdict: filters.verdict ?? '',
    [sourceKey]: filters[sourceKey] ?? '',
  }
  const { plugin, strategy, verdict } = active
  const hasFilters = Object.values(active).some(Boolean)
  const change = (key, value) => {
    if (active[key] !== value) onFilterChange?.({ ...active, [key]: value })
  }

  return <section className="rt-panel" aria-labelledby={titleId}>
    <div className="rt-panel-head">
      <h2 id={titleId} className="rt-panel-title">Results</h2>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <FilterSelect label="Plugin" allLabel="All plugins" entries={plugins} value={plugin} onChange={(value) => change('plugin', value)} />
        <FilterSelect label="Strategy" allLabel="All strategies" entries={strategies} value={strategy} onChange={(value) => change('strategy', value)} />
        <FilterSelect label={legacyFilters ? 'Evidence' : 'Source'} allLabel={legacyFilters ? 'Any evidence' : 'Any source'}
          entries={legacyFilters ? LEGACY_SOURCE_OPTIONS : SOURCE_OPTIONS} value={active[sourceKey]} onChange={(value) => change(sourceKey, value)} />
        <Button type="button" size="sm" variant="ghost" aria-disabled={!hasFilters} className="aria-disabled:opacity-50"
          onClick={() => { if (hasFilters) onFilterChange?.(emptyFilters) }}>Clear filters</Button>
      </div>
    </div>
    <div role="group" aria-label="Verdict" className="flex flex-wrap gap-2 px-[18px] pb-3">
      {(legacyFilters ? LEGACY_VERDICT_CHIPS : VERDICT_CHIPS).map((chip) => <button key={chip.value} type="button" className="rt-chip rt-press" aria-pressed={verdict === chip.value} onClick={() => change('verdict', chip.value)}>
        {chip.label}{counts[chip.count] != null && <> <span className="rt-num">{formatNumber(counts[chip.count])}</span></>}
      </button>)}
    </div>
    {error ? <div className="rt-panel-body">
      <p className="rt-banner rt-tone-fail" role="alert">Could not load results.</p>
      {onRetry && <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetry}>Retry results</Button>}
    </div> : loading ? <p className="rt-empty" role="status">Loading results…</p>
      : items.length === 0 ? <p className="rt-empty" role="status">{hasFilters ? 'No results match these filters.' : 'No results have been recorded.'}</p>
        : <>
          <div className="rt-table-region [&>[data-slot=table-container]]:contents" role="region" tabIndex={0} aria-label="Results table">
            <Table className="rt-table" role="table">
              <TableHeader role="rowgroup"><TableRow role="row">
                {HEADERS.map((label) => <TableHead key={label} scope="col" role="columnheader" className={label === '#' ? 'rt-num' : undefined}>
                  {label === 'Details' ? <span className="rt-sr-only">{label}</span> : label}
                </TableHead>)}
              </TableRow></TableHeader>
              <TableBody role="rowgroup">
                {items.map((item) => <ResultRow key={item.id} item={item} onView={onView} />)}
              </TableBody>
            </Table>
          </div>
          <div className="border-t border-[var(--rt-line-subtle)] px-4 py-3">
            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={(next) => onPageChange?.(next)} noun="results" />
          </div>
        </>}
  </section>
}
