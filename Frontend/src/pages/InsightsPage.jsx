import { useState } from 'react'
import { Activity, ArrowUpRight, CircleDollarSign, ShieldAlert, Users, Zap, Plug, ShieldCheck } from 'lucide-react'
import AnalyticsChart from '../components/AnalyticsChart'
import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import { EmptyState, SectionHeader, StatCard } from '../components/Surface'
import { formatMoney, formatNumber, formatDate, formatPercent, readable } from '../lib/format'
import './insights.css'

const dayLabel = (date) => new Date(date.slice(0, 10) + 'T12:00:00Z').toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' })
function activityDays(series = []) {
  const days = new Map()
  for (const item of series) {
    const key = item.date.slice(0, 10)
    const day = days.get(key) || { date: key, label: dayLabel(key), allowed: 0, blocked: 0, other: 0 }
    if (item.status === 'allowed') day.allowed += item.count
    else if (item.status?.startsWith('blocked')) day.blocked += item.count
    else day.other += item.count
    days.set(key, day)
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
}
function Breakdown({ title, description, rows = [], tone = 'violet', empty = 'No policy matches in this period.' }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  return <section className="analytics-surface"><SectionHeader title={title} description={description} action={<a href="#violations"><ArrowUpRight size={16} aria-label="Open violations" /></a>} />{rows.length ? <div className="signal-list">{rows.slice(0, 5).map((row, index) => <div className="signal-row" key={row.name}><div><span className="signal-rank">{String(index + 1).padStart(2, '0')}</span><span>{readable(row.name)}</span><strong>{formatNumber(row.count)}</strong></div><div className={`signal-track tone-${tone}`}><span style={{ width: `${total ? row.count / total * 100 : 0}%` }} /></div></div>)}</div> : <EmptyState title="No recorded matches" description={empty} icon={ShieldCheck} />}</section>
}
function People({ rows = [], spend = false }) {
  return <section className="analytics-surface"><SectionHeader title={spend ? 'Estimated spend by person' : 'Incidents by person'} description={spend ? 'Known estimates, across recorded runs.' : 'People with the most recorded policy matches.'} />{rows.length ? <div className="people-list">{rows.map((row, index) => <div className="people-row" key={row.name + index}><span className="person-monogram">{row.name?.slice(0, 1)}</span><div><strong>{row.name}</strong><small>{spend ? `${formatNumber(row.runs)} prompt runs` : 'Recorded incidents'}</small></div><b>{spend ? formatMoney(row.cost_usd) : formatNumber(row.count)}</b></div>)}</div> : <EmptyState title={spend ? 'No recorded spend' : 'No recorded incidents'} description="This view uses recorded activity from the current period." icon={Users} />}</section>
}
function RecentRuns({ rows = [] }) {
  const [filter, setFilter] = useState('all')
  const visible = rows.filter((run) => filter === 'all' || (filter === 'blocked' ? run.status?.startsWith('blocked') : filter === 'error' ? run.status?.endsWith('error') || run.status === 'interrupted' : run.status === filter))
  const columns = [
    { id: 'when', label: 'Submitted', value: (row) => row.created_at, render: (row) => formatDate(row.created_at) },
    { id: 'user', label: 'Person', value: (row) => row.user_name || row.user_email, render: (row) => <strong>{row.user_name || row.user_email || 'Unknown user'}</strong> },
    { id: 'model', label: 'Model', value: (row) => row.model, render: (row) => <><strong>{row.model || '—'}</strong><small>{row.provider}</small></> },
    { id: 'status', label: 'Outcome', value: (row) => row.status, render: (row) => <StatusBadge status={row.status} /> },
    { id: 'tokens', label: 'Tokens', value: (row) => row.total_tokens, render: (row) => formatNumber(row.total_tokens) },
    { id: 'cost', label: 'Estimate', value: (row) => Number(row.estimated_cost_usd), render: (row) => formatMoney(row.estimated_cost_usd) },
    { id: 'detail', label: '', required: true, render: (row) => <a className="table-detail-link" href={`#activity-log?run_id=${encodeURIComponent(row.id)}`}>View run <ArrowUpRight size={13} /></a> },
  ]
  return <DataTable title="Recent prompt activity" description={`The latest ${rows.length} runs in this seven-day period.`} rows={visible} columns={columns} emptyTitle="No matching prompt runs" emptyDescription="Recorded runs will appear here. Try another outcome filter." toolbar={<div className="segmented-control" aria-label="Filter recent runs">{[['all', 'All runs'], ['allowed', 'Allowed'], ['blocked', 'Blocked'], ['error', 'Errors']].map(([key, label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div>} />
}
export default function InsightsPage({ data }) {
  const summary = data?.summary || {}
  const admin = data?.administration || {}
  const days = activityDays(data?.series)
  const total = Number(summary.total_submissions || 0)
  const models = data?.models || []
  const outcomes = [{ label: 'Allowed', count: Number(summary.allowed || 0), tone: 'allowed' }, { label: 'Blocked', count: Number(summary.blocked || 0), tone: 'blocked' }, { label: 'Errors', count: Object.values(summary.errors || {}).reduce((sum, value) => sum + Number(value || 0), 0), tone: 'other' }, { label: 'Processing', count: Number(summary.processing || 0), tone: 'processing' }]
  return <div className="insights-page">
    <section className="stat-grid" aria-label="Recorded activity metrics"><StatCard title="Prompt runs" value={formatNumber(total)} description="Submitted in the last seven days" icon={Activity} href="#activity-log" /><StatCard title="Known tokens" value={formatNumber(Number(summary.known_prompt_tokens || 0) + Number(summary.known_completion_tokens || 0))} description={`${formatNumber(summary.unknown_usage_runs || 0)} runs with unknown usage`} icon={Zap} href="#catalog" /><StatCard title="Estimated spend" value={formatMoney(summary.estimated_cost_usd)} description={`${formatNumber(summary.unknown_cost_runs || 0)} runs with unknown or partial cost`} icon={CircleDollarSign} href="#spend" /><StatCard title="Policy incidents" value={formatNumber(summary.violation_events || 0)} description={summary.violation_rate == null ? 'No completed evaluations' : `${formatPercent(summary.violation_rate)} of evaluated runs`} icon={ShieldAlert} tone="danger" href="#violations" /></section>
    <div className="overview-primary-grid"><AnalyticsChart title="Prompt activity" description="Daily submissions by outcome · UTC" data={days} series={[{ key: 'allowed', label: 'Allowed' }, { key: 'blocked', label: 'Blocked' }, { key: 'other', label: 'Other' }]} stacked action={<a href="#activity-log">View activity ↗</a>} /><section className="analytics-surface outcome-surface"><SectionHeader title="Execution outcomes" description="What happened to submitted prompts." /><div className="outcome-total"><strong>{formatNumber(total)}</strong><span>recorded submissions</span></div><div className="outcome-distribution" aria-label="Run outcome proportions">{outcomes.map((item) => <span className={`outcome-${item.tone}`} key={item.label} style={{ flex: item.count || 0, display: item.count ? undefined : 'none' }} title={`${item.label}: ${item.count}`} />)}</div><div className="outcome-rows">{outcomes.map((item) => <div key={item.label}><span><i className={`outcome-${item.tone}`} />{item.label}</span><strong>{formatNumber(item.count)}</strong><small>{total ? formatPercent(item.count / total) : '—'}</small></div>)}</div><p className="report-footnote">{formatNumber(summary.incomplete_evaluation || 0)} incomplete evaluations. Violation rate uses {formatNumber(summary.violation_rate_denominator || 0)} evaluated runs.</p></section></div>
    <div className="overview-secondary-grid"><Breakdown title="Policy categories" description="Where recorded matches occur." rows={data?.violation_categories} /><Breakdown title="Matched check types" description="Detection types represented in incidents." rows={data?.violation_types} tone="rose" /><People rows={data?.users_at_risk} /></div>
    <div className="overview-primary-grid"><AnalyticsChart title="Daily estimated spend" description="Known cost estimates for submitted prompts · UTC" type="line" data={(data?.cost_series || []).map((row) => ({ label: dayLabel(row.date), cost: Number(row.cost_usd) }))} series={[{ key: 'cost', label: 'Estimated USD' }]} formatValue={formatMoney} action={<a href="#spend">Explore spend ↗</a>} /><People rows={data?.spend_by_user} spend /></div>
    <DataTable title="Model usage" description="Recorded usage, with explicit coverage for missing provider tokens." rows={models} rowKey={(row) => `${row.provider}:${row.model}`} emptyTitle="No model usage yet" emptyDescription="Usage appears after a prompt run." columns={[{ id: 'model', label: 'Model', value: (row) => row.model, render: (row) => <><strong>{row.model}</strong><small>{row.provider}</small></> }, { id: 'runs', label: 'Runs', value: (row) => row.runs, render: (row) => formatNumber(row.runs) }, { id: 'tokens', label: 'Known tokens', value: (row) => row.known_tokens, render: (row) => formatNumber(row.known_tokens) }, { id: 'cost', label: 'Estimated cost', value: (row) => Number(row.estimated_cost_usd), render: (row) => formatMoney(row.estimated_cost_usd) }, { id: 'coverage', label: 'Usage reported', render: (row) => <span>{Math.max(0, Number(row.runs || 0) - Number(row.unknown_usage_runs || 0))} / {formatNumber(row.runs)} runs</span> }]} />
    <RecentRuns rows={data?.recent_runs} />
    <section className="configuration-strip"><div><ShieldCheck size={19} /><span><strong>Organization configuration</strong><small>Configured resources; assignments determine enforcement.</small></span></div><a href="#users"><Users size={15} /><strong>{formatNumber(admin.active_users || 0)}</strong><span>active / {formatNumber(admin.users || 0)} people</span></a><a href="#inventory"><strong>{formatNumber(admin.groups || 0)}</strong><span>groups</span></a><a href="#integrations"><Plug size={15} /><strong>{formatNumber(admin.integrations || 0)}</strong><span>integrations</span></a><a href="#policies"><strong>{formatNumber(admin.policies || 0)}</strong><span>policies</span></a></section>
    {(summary.legacy_history_count || summary.unknown_cost_runs) ? <p className="report-footnote">{formatNumber(summary.legacy_history_count || 0)} legacy records excluded from security rates. Cost totals include known estimates only.</p> : null}
  </div>
}
