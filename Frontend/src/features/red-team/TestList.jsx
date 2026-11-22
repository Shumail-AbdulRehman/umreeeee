import { Plus } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { EmptyState, Pagination, SearchInput } from '../../components/Surface'
import { formatDate, formatPercent } from '../../lib/format'
import { levelLabel, modeLabel, notScored, statusLabel } from './labels'
import './red-team.css'

const STATUS_OPTIONS = [
  ['', 'All statuses'], ['completed', 'Completed'], ['running', 'Running'], ['queued', 'Queued'],
  ['draft', 'Draft'], ['partially_failed', 'Partially failed'], ['failed', 'Failed'], ['cancelled', 'Cancelled'],
]
const MODE_OPTIONS = [['', 'All modes'], ['raw', 'Raw'], ['protected', 'Protected']]
const selectStyle = { minHeight: 34, padding: '0 10px', border: '1px solid var(--rt-line)', borderRadius: 7, background: 'var(--rt-surface)', color: 'var(--rt-ink)', font: 'inherit', fontSize: 13 }
const linkStyle = { background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 500, color: 'var(--rt-accent)', cursor: 'pointer', textAlign: 'left' }

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const modeOf = (t) => String(t?.mode ?? '').toLowerCase()

function progressPercent(test) {
  const total = Number(test?.progress?.total_jobs)
  const done = Number(test?.progress?.terminal_jobs)
  return total > 0 && Number.isFinite(done) ? Math.min(100, (done / total) * 100) : undefined
}

// Groups tests sharing comparison_group_id (raw first); preserves incoming order by first appearance.
function groupTests(items = []) {
  const groups = []
  const byId = new Map()
  for (const test of items) {
    const key = test?.comparison_group_id
    if (key == null || key === '') { groups.push([test]); continue }
    if (!byId.has(key)) { const g = []; byId.set(key, g); groups.push(g) }
    byId.get(key).push(test)
  }
  return groups.map((g) => {
    const raw = g.find((t) => modeOf(t) === 'raw')
    return raw ? [raw, ...g.filter((t) => t !== raw)] : g
  })
}

function Missing() {
  return <span className="rt-muted"><span aria-hidden="true">–</span><span className="rt-sr-only">{notScored}</span></span>
}

function Badge({ meta, small = false }) {
  return <span className={`rt-badge rt-tone-${meta.tone}${small ? ' rt-badge-sm' : ''}`}>{meta.label}</span>
}

function riskCell(test) {
  const risk = test.summary?.risk
  if (isNum(risk?.score)) {
    const level = levelLabel(risk.level)
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><strong className="rt-num" style={{ display: 'inline' }}>{risk.score.toFixed(1)}</strong>{!level.missing && <Badge meta={level} />}</span>
  }
  const legacy = isNum(test.score) ? test.score : test.score?.compliance_score
  if (test.format !== 'plugins' && isNum(legacy)) {
    return <span className="rt-muted">Earlier format · compliance {Math.round(legacy <= 1 ? legacy * 100 : legacy)}%</span>
  }
  return <Missing />
}

function attackCell(test) {
  const rate = test.summary?.attack_success?.rate
  return isNum(rate) ? formatPercent(rate) : <Missing />
}

function Row({ test, paired, onOpen }) {
  const name = test.name || 'Untitled test'
  const status = statusLabel(test.status, progressPercent(test))
  const mode = modeLabel(test.mode)
  const model = test.model || test.config_snapshot?.model
  const provider = test.provider || test.config_snapshot?.provider
  return (
    <tr>
      <td data-label="Test" style={paired ? { paddingLeft: 32 } : undefined}>
        <button type="button" className="rt-press" style={linkStyle} onClick={() => onOpen?.(test.id)}>
          {paired ? <><span aria-hidden="true">↳ </span>With policies<span className="rt-sr-only">, {name}</span></> : name}
        </button>
      </td>
      <td data-label="Overall risk">{riskCell(test)}</td>
      <td data-label="Attack success" className="rt-num">{attackCell(test)}</td>
      <td data-label="Status"><Badge meta={status} /></td>
      <td data-label="Mode"><Badge meta={mode} /></td>
      <td data-label="Target model">{model ? <><strong>{model}</strong>{provider && <small>{provider}</small>}</> : <Missing />}</td>
      <td data-label="Created" className="rt-nowrap">{formatDate(test.created_at)}</td>
    </tr>
  )
}

function Readiness({ readiness }) {
  if (!readiness) return null
  const waiting = readiness.state === 'waiting' || readiness.status === 'waiting'
  const seen = readiness.lastSeenSeconds
  if (waiting) {
    return (
      <div className="rt-banner rt-tone-warn" role="status" style={{ marginBottom: 16 }}>
        <span><strong>Test runner not responding.</strong>{' '}
          {isNum(seen) ? `Last seen ${seen} s ago.` : 'It has not been seen yet.'} New tests will wait in the queue until it is back.</span>
      </div>
    )
  }
  return (
    <section aria-label="Execution readiness" className="rt-banner rt-tone-pass" style={{ marginBottom: 16, flexWrap: 'wrap', columnGap: 16 }}>
      <strong>Ready to run</strong>
      {isNum(seen) && <span>Test runner active {seen} s ago</span>}
      {readiness.queueConnected && <span>Queue connected</span>}
      {isNum(readiness.requestsPerMinute) && <span>Up to {readiness.requestsPerMinute} requests per minute</span>}
    </section>
  )
}

export default function TestList({
  items = [], total = 0, page = 1, pageSize = 20, onPageChange,
  query = '', status = '', mode = '', onFilterChange,
  readiness, onNew, onOpen,
}) {
  const filtered = Boolean(query || status || mode)
  const change = (patch) => onFilterChange?.({ query, status, mode, ...patch })
  const newButton = <Button onClick={() => onNew?.()}><Plus size={16} aria-hidden="true" /><span>New test</span></Button>
  const groups = groupTests(items)

  return (
    <div>
      <Readiness readiness={readiness} />
      <div className="rt-panel">
        <div className="rt-panel-head" style={{ flexWrap: 'wrap', gap: 12 }}>
          <h2 className="rt-panel-title" id="rt-tests-title">Tests</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <SearchInput label="Search tests" placeholder="Search tests…" value={query} onChange={(e) => change({ query: e.target.value })} />
            <select aria-label="Status" style={selectStyle} value={status} onChange={(e) => change({ status: e.target.value })}>
              {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select aria-label="Mode" style={selectStyle} value={mode} onChange={(e) => change({ mode: e.target.value })}>
              {MODE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {newButton}
          </div>
        </div>
        {items.length === 0 ? (
          filtered ? (
            <EmptyState title="No tests match these filters" description="Try a different search or clear the filters."
              action={<Button variant="outline" onClick={() => onFilterChange?.({ query: '', status: '', mode: '' })}>Clear filters</Button>} />
          ) : (
            <EmptyState title="No Red Team tests yet" description="Attack a connected model with synthetic tests, then compare it with your policies turned on." action={newButton} />
          )
        ) : (
          <div className="rt-table-region" role="region" tabIndex={0} aria-labelledby="rt-tests-title">
            <table className="rt-table">
              <thead><tr>
                <th scope="col">Test</th><th scope="col">Overall risk</th><th scope="col" className="rt-num">Attack success</th>
                <th scope="col">Status</th><th scope="col">Mode</th><th scope="col">Target model</th><th scope="col">Created</th>
              </tr></thead>
              {groups.map((group) => (
                <tbody key={group[0].id} data-group={group.length > 1 ? 'pair' : undefined}>
                  {group.map((test, i) => <Row key={test.id} test={test} paired={i > 0} onOpen={onOpen} />)}
                </tbody>
              ))}
            </table>
          </div>
        )}
        <div className="rt-panel-foot">
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} noun="tests" />
        </div>
      </div>
    </div>
  )
}
