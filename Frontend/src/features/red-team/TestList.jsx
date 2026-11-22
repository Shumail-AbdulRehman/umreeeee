import { Plus } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { InlineLoadingBar } from '../../components/LoadingSurface'
import StatusBadge from '../../components/StatusBadge'
import { EmptyState, Pagination, SearchInput } from '../../components/Surface'
import { formatDate, formatPercent } from '../../lib/format'
import { levelLabel, modeLabel, notScored, statusLabel } from './labels'
import './red-team.css'

const STATUSES = ['completed', 'running', 'generating', 'queued', 'draft', 'cancelling', 'partially_failed', 'failed', 'cancelled']
const SCORED_STATUSES = new Set(['completed', 'partially_failed', 'failed', 'cancelled'])
const MODE_OPTIONS = [['', 'All modes'], ['raw', 'Raw'], ['protected', 'Protected']]
const selectStyle = { minHeight: 34, padding: '0 10px', border: '1px solid var(--rt-line)', borderRadius: 7, background: 'var(--rt-surface)', color: 'var(--rt-ink)', font: 'inherit', fontSize: 13 }
const linkStyle = { background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 500, color: 'var(--rt-accent)', cursor: 'pointer', textAlign: 'left' }

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const modeOf = (t) => String(t?.mode ?? '').toLowerCase()

function legacyProgressPercent(test) {
  if (test.engine === 'promptfoo' || test.counts || test.progress?.phase) return undefined
  const { total_jobs: total, terminal_jobs: done } = test.progress ?? {}
  return total > 0 && isNum(done) && done >= 0 ? Math.min(100, (done / total) * 100) : undefined
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
  if (test.engine !== 'promptfoo' && test.format !== 'plugins' && isNum(legacy)) {
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
  const status = statusLabel(test.status, legacyProgressPercent(test))
  const scored = SCORED_STATUSES.has(test.status)
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
      <td data-label="Overall risk">{scored ? riskCell(test) : <Missing />}</td>
      <td data-label="Attack success" className="rt-num">{scored ? attackCell(test) : <Missing />}</td>
      <td data-label="Status"><Badge meta={status} /></td>
      <td data-label="Mode"><Badge meta={mode} /></td>
      <td data-label="Target model">{model ? <><strong>{model}</strong>{provider && <small>{provider}</small>}</> : <Missing />}</td>
      <td data-label="Created" className="rt-nowrap">{formatDate(test.created_at)}</td>
    </tr>
  )
}

function Readiness({ readiness }) {
  if (!readiness) return null
  const { promptfoo, dispatcher_observed: dispatcher, lastSeenSeconds } = readiness
  const version = promptfoo?.version
  const runtimeAvailable = Boolean(version) && promptfoo?.available === true
  const keyConfigured = promptfoo?.cloud_key_configured === true
  const brokerReachable = readiness.broker_transport_reachable ?? readiness.queueConnected
  const workerActive = readiness.worker_observed ?? (readiness.state === 'ready' ? true : undefined)
  const ready = runtimeAvailable && keyConfigured && brokerReachable === true && workerActive === true && dispatcher !== false
  return (
    <section aria-label="Execution readiness" className="rt-banner mb-4 flex-wrap items-center gap-x-4">
      <span role="status"><StatusBadge status={ready ? 'active' : 'pending'}>{ready ? 'Ready to run' : 'Launch unavailable'}</StatusBadge></span>
      <ul className="flex flex-wrap gap-x-4 gap-y-1" role="list">
        <li>{version ? `promptfoo ${version}` : 'promptfoo version unavailable'}{version && !runtimeAvailable && ' · runtime unavailable'}</li>
        <li>{keyConfigured ? 'promptfoo Cloud key configured' : 'promptfoo Cloud key not configured'}</li>
        <li>{brokerReachable === true ? 'Broker connected' : 'Broker connection unavailable'}</li>
        <li>{workerActive === true ? 'Worker active' : 'Worker not responding'}{isNum(lastSeenSeconds) && ` · last seen ${lastSeenSeconds} s ago`}</li>
        {dispatcher === false && <li>Dispatcher not responding</li>}
      </ul>
    </section>
  )
}

export default function TestList({
  items = [], total = 0, page = 1, pageSize = 20, onPageChange,
  query = '', status = '', mode = '', onFilterChange,
  readiness, loading = false, error, onRetry, onNew, onOpen,
}) {
  const filtered = Boolean(query || status || mode)
  const empty = !error && !loading && !filtered && items.length === 0
  const change = (patch) => onFilterChange?.({ query, status, mode, ...patch })
  const newButton = <Button type="button" onClick={() => onNew?.()}><Plus size={16} aria-hidden="true" /><span>New test</span></Button>
  const groups = groupTests(items)

  return (
    <div>
      <Readiness readiness={readiness} />
      <section className="rt-panel">
        <div className="rt-panel-head">
          <h2 className="rt-panel-title" id="rt-tests-title">Tests</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <SearchInput label="Search tests" placeholder="Search tests…" value={query} onChange={(e) => change({ query: e.target.value })} />
            <select aria-label="Status" style={selectStyle} value={status} onChange={(e) => change({ status: e.target.value })}>
              <option value="">All statuses</option>
              {STATUSES.map((value) => <option key={value} value={value}>{statusLabel(value).label}</option>)}
            </select>
            <select aria-label="Mode" style={selectStyle} value={mode} onChange={(e) => change({ mode: e.target.value })}>
              {MODE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {!empty && newButton}
          </div>
        </div>
        {error ? (
          <div className="rt-panel-body flex flex-wrap items-center gap-3">
            <p role="alert">Could not load tests.</p>
            {onRetry && <Button type="button" variant="outline" onClick={onRetry}>Retry</Button>}
          </div>
        ) : loading ? (
          <div className="rt-panel-body"><InlineLoadingBar label="Loading tests…" /></div>
        ) : items.length === 0 ? (
          filtered ? (
            <EmptyState title="No tests match these filters" description="Try a different search or clear the filters."
              action={<Button variant="outline" onClick={() => onFilterChange?.({ query: '', status: '', mode: '' })}>Clear filters</Button>} />
          ) : (
            <EmptyState title="No Red Team tests yet" description="Create a draft to choose a target model and the attacks to run." action={newButton} />
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
        {!error && !loading && <div className="rt-panel-foot">
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} noun="tests" />
        </div>}
      </section>
    </div>
  )
}
