import { useEffect, useState } from 'react'
import { Activity, ArrowUpRight, Check, ChevronRight, RefreshCw, Search, ShieldCheck, Users, X } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { fetchManagedUsers } from '../services/users/userManagementService'
import { getModels, getSeries, getSummary } from '../services/observability'
import AnalyticsChart from '../components/AnalyticsChart'
import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import LoadingSurface from '../components/LoadingSurface'
import { EmptyState, Pagination, SearchInput, SectionHeader } from '../components/Surface'
import { Button } from '../components/ui/button'
import { Skeleton } from '../components/ui/skeleton'
import { formatMoney, formatNumber, formatPercent } from '../lib/format'
import { dailyOutcomes, executionOutcomes, insightParams } from './user-insights-data'
import './user-insights.css'

const nameOf = (person) => [person.first_name, person.last_name].filter(Boolean).join(' ') || person.email
const roleOf = (role) => role === 'org_admin' ? 'Organization admin' : role === 'super_admin' ? 'Super admin' : 'Workspace member'
const ms = (value) => value == null ? 'No data' : `${Number(value).toLocaleString([], { maximumFractionDigits: 1 })} ms`
const stageNames = { provider_latency_ms: 'Provider', enforcement_latency_ms: 'Policy checks', total_latency_ms: 'Total execution' }

function OutcomeTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return <div className="chart-tooltip"><strong>{row.label}</strong>{formatNumber(row.count)} runs</div>
}

function Outcomes({ summary }) {
  const rows = executionOutcomes(summary)
  const total = Number(summary.total_submissions || 0)
  const remaining = Math.max(0, total - rows.reduce((sum, row) => sum + row.count, 0))
  if (remaining) rows.push({ label: 'Other outcomes', count: remaining, color: 'var(--chart-3)' })
  return <section className="analytics-surface user-outcomes">
    <SectionHeader title="Execution outcomes" description="A blocked prompt and a technical error are different outcomes." />
    {total ? <>
      <div className="user-outcome-ring" role="img" aria-label={`${formatNumber(total)} submitted runs. Outcome counts are listed below.`}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart><Pie data={rows.filter((row) => row.count > 0)} dataKey="count" nameKey="label" innerRadius="72%" outerRadius="93%" paddingAngle={rows.filter((row) => row.count > 0).length > 1 ? 3 : 0} stroke="var(--panel)" strokeWidth={2} isAnimationActive={false}>
            {rows.filter((row) => row.count > 0).map((row) => <Cell key={row.label} fill={row.color} />)}
          </Pie><Tooltip content={<OutcomeTooltip />} /></PieChart>
        </ResponsiveContainer>
        <div className="user-outcome-center" aria-hidden="true"><strong>{formatNumber(total)}</strong><span>prompt runs</span></div>
      </div>
      <ul className="user-outcome-legend">{rows.map((row) => <li key={row.label}><span><i style={{ background: row.color }} aria-hidden="true" />{row.label}</span><strong>{formatNumber(row.count)}</strong><small>{formatPercent(row.count / total)}</small></li>)}</ul>
    </> : <EmptyState icon={Activity} title="No outcomes in this period" description="Select another person or a longer period to explore recorded activity." />}
  </section>
}

function Coverage({ summary }) {
  const completed = Math.max(0, Number(summary.total_submissions || 0) - Number(summary.processing || 0))
  const coverage = summary.evaluation_coverage
  return <section className="user-coverage" aria-label="Analytics coverage">
    <div className="user-coverage-heading"><ShieldCheck size={19} /><div><h2>Read the results with context</h2><p>Review coverage before interpreting incident rates and spend.</p></div></div>
    <div className="user-coverage-item"><span>Policy evaluation coverage</span><strong>{coverage == null ? 'No eligible measurements' : formatPercent(coverage)}</strong>{coverage != null && <progress value={coverage} max={1} aria-label="Policy evaluation coverage" />}<small>{formatNumber(summary.violation_rate_denominator)} of {formatNumber(completed)} completed runs have at least one completed policy check.</small></div>
    <div className="user-coverage-item"><span>Incident rate</span><strong>{summary.violation_rate == null ? 'No eligible measurements' : formatPercent(summary.violation_rate)}</strong><small>Runs with incidents / evaluated runs. {formatNumber(summary.incomplete_evaluation)} runs have incomplete evaluations.</small></div>
    <div className="user-coverage-item"><span>Missing provider measurements</span><strong>{formatNumber(summary.unknown_usage_runs)} <em>unknown usage</em></strong><small>{formatNumber(summary.unknown_cost_runs)} runs have unknown or partial cost. Spend includes known estimates only.</small></div>
  </section>
}

export default function UserInsightsPage() {
  const [selected, setSelected] = useState(null)
  const [days, setDays] = useState(7)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [people, setPeople] = useState({ items: [], total: 0, page_size: 20 })
  const [directoryLoading, setDirectoryLoading] = useState(true)
  const [directoryError, setDirectoryError] = useState('')
  const [directoryRefresh, setDirectoryRefresh] = useState(0)
  const [report, setReport] = useState({ loading: true, data: null, error: '' })
  const [refresh, setRefresh] = useState(0)
  const userId = selected?.id || ''

  useEffect(() => {
    let active = true
    const timer = setTimeout(async () => {
      setDirectoryLoading(true)
      setDirectoryError('')
      try {
        const params = new URLSearchParams({ page: String(page), page_size: '20', q: query })
        if (status) params.set('status', status)
        const result = await fetchManagedUsers(`?${params}`)
        if (active) setPeople(result)
      } catch (error) {
        if (active) setDirectoryError(error.message)
      } finally {
        if (active) setDirectoryLoading(false)
      }
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [query, status, page, directoryRefresh])

  useEffect(() => {
    let active = true
    const params = insightParams(days, userId)
    // Clear the previous person’s report before exposing the new selection.
    Promise.resolve().then(async () => {
      if (!active) return
      setReport({ loading: true, data: null, error: '' })
      try {
        const [summary, series, models] = await Promise.all([getSummary(params.query), getSeries(params.query), getModels(params.query)])
        if (active) setReport({ loading: false, error: '', data: { summary, series: series.items || [], models: models.items || [], ...params, userId, days } })
      } catch (error) {
        if (active) setReport({ loading: false, data: null, error: error.message })
      }
    })
    return () => { active = false }
  }, [days, userId, refresh])

  // Even before the effect runs, never show the previous scope beneath a new name.
  const data = report.data?.userId === userId && report.data?.days === days ? report.data : null
  const loading = report.loading || (!data && !report.error)
  const summary = data?.summary
  const total = summary?.total_submissions
  const activity = data ? dailyOutcomes(data.series, data.summary.filters?.from || data.from, data.summary.filters?.to || data.to) : []
  const latency = Object.entries(summary?.latency || {}).filter(([, row]) => row.count > 0).map(([key, row]) => ({ ...row, label: stageNames[key] || key }))
  const personName = selected ? nameOf(selected) : 'Everyone in your organization'

  return <div className="user-insights-page">
    <div className="user-insights-controls"><div><span className="user-insights-kicker">PEOPLE ANALYTICS</span><p>Understand activity. Review outcomes. Manage access with context.</p></div><div className="user-insights-control-actions"><label className="user-insights-period"><span>Reporting period</span><select aria-label="User insights reporting period" value={days} onChange={(event) => setDays(Number(event.target.value))}>{[7, 30, 90].map((value) => <option key={value} value={value}>Last {value} days · UTC</option>)}</select></label><Button variant="outline" size="sm" disabled={loading} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={14} />Refresh</Button></div></div>
    <div className="user-insights-layout">
      <aside className="user-directory" aria-label="Choose a person for analytics">
        <div className="user-directory-heading"><h2>People</h2><a href="#users" aria-label="Manage users"><ArrowUpRight size={16} /></a></div>
        <div className="user-directory-filters"><SearchInput label="Search people for insights" placeholder="Name or email…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} /><select aria-label="Filter people by account status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="">All account statuses</option>{['active', 'invited', 'pending_verification', 'inactive'].map((value) => <option value={value} key={value}>{value.replaceAll('_', ' ')}</option>)}</select></div>
        <button className={`user-directory-all ${!selected ? 'is-selected' : ''}`} aria-pressed={!selected} onClick={() => setSelected(null)}><span className="person-monogram"><Users size={17} /></span><span><strong>Everyone</strong><small>Organization-wide activity</small></span>{!selected && <Check size={15} aria-hidden="true" />}</button>
        <div className="user-directory-results" aria-busy={directoryLoading}>
          {directoryError ? <div className="user-directory-error" role="alert"><p>{directoryError}</p><Button variant="outline" size="sm" onClick={() => setDirectoryRefresh((value) => value + 1)}>Retry people</Button></div> : directoryLoading ? <div className="user-directory-skeleton" aria-label="Loading people" role="status">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="user-directory-placeholder" />)}</div> : people.items.length ? people.items.map((person) => <button className={`user-directory-person ${selected?.id === person.id ? 'is-selected' : ''}`} key={person.id} aria-pressed={selected?.id === person.id} onClick={() => setSelected(person)}><span className="person-monogram">{person.first_name?.[0]}{person.last_name?.[0]}</span><span><strong>{nameOf(person)}</strong><small>{person.department || person.email}</small></span><ChevronRight size={14} aria-hidden="true" /></button>) : <EmptyState icon={Search} title="No matching people" description="Try another name or account status." action={(query || status) && <Button variant="outline" size="sm" onClick={() => { setQuery(''); setStatus(''); setPage(1) }}>Clear filters</Button>} />}
        </div>
        {!directoryLoading && !directoryError && <div className="user-directory-pagination"><Pagination page={page} pageSize={people.page_size || 20} total={people.total} onPageChange={setPage} noun="people" /></div>}
        <p className="user-directory-note">Account status filters the people list. Analytics reflect the selected person’s recorded runs.</p>
      </aside>
      <div className="user-insight-report">
        <section className="user-insight-identity" aria-label="Current analytics scope"><div className="user-insight-avatar">{selected ? <span>{selected.first_name?.[0]}{selected.last_name?.[0]}</span> : <Users size={26} />}</div><div className="user-insight-person"><span className="user-insights-kicker">{selected ? 'INDIVIDUAL REPORT' : 'ORGANIZATION REPORT'}</span><h2>{personName}</h2><p>{selected ? selected.email : 'Choose a person to explore their individual activity.'}</p><div className="user-insight-meta">{selected ? <><StatusBadge status={selected.account_status} /><span>{roleOf(selected.role)}</span>{selected.department && <span>{selected.department}</span>}<span>{formatNumber(selected.group_ids?.length || 0)} assigned groups</span></> : <><span>All workspace users</span><span>Only recorded prompt activity</span></>}</div></div>{selected ? <Button variant="ghost" size="sm" onClick={() => setSelected(null)}><X size={14} />Clear selection</Button> : <a className="user-insight-manage" href="#users">Manage access <ArrowUpRight size={14} /></a>}</section>
        {loading ? <LoadingSurface kind="user-report" label={`Loading ${selected ? 'individual' : 'organization'} analytics…`} /> : report.error ? <div className="admin-error user-insight-error" role="alert"><div><strong>Could not load this report</strong><p>{report.error}</p></div><Button variant="outline" size="sm" onClick={() => setRefresh((value) => value + 1)}>Retry report</Button></div> : data && <>
          <section className="user-insight-metrics" aria-label="Selected scope metrics"><div><span>Prompt runs</span><strong>{formatNumber(total)}</strong><small>In the selected {days}-day period</small></div><div><span>Allowed share</span><strong>{Number(total) > 0 ? formatPercent(Number(summary.allowed || 0) / Number(total)) : 'No runs'}</strong><small>{formatNumber(summary.allowed)} permitted / {formatNumber(total)} submitted</small></div><div><span>Policy incidents</span><strong className={summary.violation_events > 0 ? 'user-metric-attention' : ''}>{formatNumber(summary.violation_events)}</strong><small>{formatNumber(summary.runs_with_violations)} runs with recorded incidents</small></div><div><span>Known estimated spend</span><strong>{formatMoney(summary.estimated_cost_usd)}</strong><small>{formatNumber(summary.unknown_cost_runs)} runs with unknown or partial cost</small></div></section>
          <div className="user-insight-activity-grid"><AnalyticsChart title="Activity over time" description={`Daily prompt submissions for ${selected ? 'this person' : 'your organization'} · UTC`} data={activity} series={[{ key: 'allowed', label: 'Allowed' }, { key: 'blocked', label: 'Blocked' }, { key: 'errors', label: 'Technical errors', color: 'var(--ink-3)' }, { key: 'processing', label: 'Processing' }, ...(activity.some((row) => row.other > 0) ? [{ key: 'other', label: 'Other', color: 'var(--chart-3)' }] : [])]} stacked height={260} emptyDescription="No prompt submissions in the selected period. Try a longer period or another person." /><Outcomes summary={summary} /></div>
          <Coverage summary={summary} />
          <div className="user-insight-comparison-grid"><AnalyticsChart title="Most-used models" description="The five busiest provider/model pairs in this report." horizontal data={[...data.models].sort((a, b) => b.runs - a.runs).slice(0, 5).map((row) => ({ label: `${row.model || 'Unspecified'} · ${row.provider || 'Unknown provider'}`, runs: row.runs }))} series={[{ key: 'runs', label: 'Prompt runs' }]} height={240} /><AnalyticsChart title="Execution time" description="Typical and tail latency across recorded execution stages." data={latency} series={[{ key: 'p50', label: 'p50 · typical' }, { key: 'p95', label: 'p95', color: 'var(--chart-3)' }]} formatValue={ms} height={240} emptyDescription="No recorded latency samples for this scope and period." /></div>
          <DataTable title="Model usage & cost" description="All observed provider/model pairs. Estimates use reported tokens and configured or automatic pricing." rows={data.models} rowKey={(row) => `${row.provider}:${row.model}`} emptyTitle="No observed model usage" emptyDescription="Model usage will appear after a prompt is submitted in this period." columns={[
            { id: 'model', label: 'Model', value: (row) => row.model, render: (row) => <><strong>{row.model || 'Unspecified'}</strong><small>{row.provider || 'Unknown provider'}</small></> },
            { id: 'runs', label: 'Runs', value: (row) => row.runs, render: (row) => formatNumber(row.runs) },
            { id: 'tokens', label: 'Known tokens', value: (row) => row.known_tokens, render: (row) => formatNumber(row.known_tokens) },
            { id: 'cost', label: 'Known estimated cost', value: (row) => Number(row.estimated_cost_usd), render: (row) => formatMoney(row.estimated_cost_usd) },
            { id: 'usage', label: 'Unknown usage', value: (row) => row.unknown_usage_runs, render: (row) => formatNumber(row.unknown_usage_runs) },
            { id: 'unknown', label: 'Unknown / partial cost', value: (row) => row.unknown_cost_runs, render: (row) => formatNumber(row.unknown_cost_runs) },
          ]} />
          <footer className="user-insight-footnote"><span>Report interval: {new Date(summary.filters?.from || data.from).toLocaleString('en-US', { timeZone: 'UTC' })} to {new Date(summary.filters?.to || data.to).toLocaleString('en-US', { timeZone: 'UTC' })} UTC. Boundaries may include partial days.</span><span>{formatNumber(summary.legacy_history_count || 0)} legacy records excluded from security rates. Cost estimates are not a billing statement.</span></footer>
        </>}
      </div>
    </div>
  </div>
}
