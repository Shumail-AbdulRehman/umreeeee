import { useId } from 'react'
import { Activity, ArrowUpRight, Building2, CalendarDays, ChartNoAxesCombined, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Clock3, Mail, Plug, ShieldAlert } from 'lucide-react'
import { formatNumber } from '../../lib/format'
import { formatDate } from './platformFormat'

const bucketFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0
const totalPoint = (point) => number(point.allowed) + number(point.blocked) + number(point.other)

export function PageHeading({ title, description, children }) {
  return <div className="page-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{children}</div>
}

export function PeriodControl({ days, onChange }) {
  const id = useId()
  return <div className="period-control"><label className="sr-only" htmlFor={id}>Reporting period</label><CalendarDays aria-hidden="true" /><select id={id} value={days} onChange={(event) => onChange(Number(event.target.value))}><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select><ChevronDown aria-hidden="true" /></div>
}

export function MetricStrip({ items }) {
  return <section className="metric-strip" aria-label="Company summary">{items.map(({ label, value, description, tone = 'violet', icon: Icon = Building2 }) => <div className="metric" key={label}><span className={`metric-icon ${tone}`}><Icon aria-hidden="true" /></span><div><h2>{label}</h2><strong>{value == null ? '—' : typeof value === 'number' ? formatNumber(value) : value}</strong><p>{description}</p></div></div>)}</section>
}

export function WorkspaceChart({ series = [], window: interval, title = 'Workspace activity' }) {
  const id = useId()
  const points = series.map((point) => ({ ...point, allowed: number(point.allowed), blocked: number(point.blocked), other: number(point.other) }))
  const bucketSize = Math.max(1, Math.ceil(points.length / 10))
  const chartPoints = []
  for (let index = 0; index < points.length; index += bucketSize) {
    const bucket = points.slice(index, index + bucketSize)
    chartPoints.push({ date: bucket[0].date, endDate: bucket[bucket.length - 1].date,
      ...Object.fromEntries(['allowed', 'blocked', 'other'].map((field) => [field, bucket.reduce((sum, point) => sum + point[field], 0)])) })
  }
  const values = chartPoints.map(totalPoint)
  const peak = Math.max(0, ...values)
  const step = [5, 10, 25, 50, 100, 150, 200, 250, 400, 500, 750, 1000, 1500, 2000, 3000].find((value) => value * 4 >= peak * 1.12) || Math.ceil(peak / 3000) * 1000
  const maximum = step * 4
  const axis = [maximum, maximum * .75, maximum * .5, maximum * .25, 0]
  const labels = chartPoints.map(({ date }) => {
    const value = new Date(date)
    return Number.isNaN(value.getTime()) ? '—' : bucketFormatter.format(value)
  })
  const dateRange = interval?.from && interval?.to ? `${formatDate(interval.from, { dateOnly: true })}–${formatDate(interval.to, { dateOnly: true })} · UTC` : 'Recorded workspace submissions · UTC'
  const outcomes = [{ field: 'allowed', label: 'Allowed' }, { field: 'blocked', label: 'Blocked' }, { field: 'other', label: 'Other outcomes' }]
  return <section className="panel chart-panel" aria-labelledby={id}>
    <div className="panel-head"><div><h2 id={id}>{title}</h2><p>{dateRange}</p></div><span className="chart-icon"><ChartNoAxesCombined aria-hidden="true" /></span></div>
    <div className="chart-summary"><strong>{formatNumber(values.reduce((sum, value) => sum + value, 0))}</strong><span>prompt submissions</span></div>
    {peak > 0 ? <div className="chart" aria-hidden="true">
      <div className="axis">{axis.map((value) => <span key={value}>{value >= 1000 ? `${Number((value / 1000).toFixed(2))}k` : value}</span>)}</div>
      <div className="plot"><div className="grid-lines">{axis.map((value) => <i key={value} />)}</div><div className="bars" style={{ '--columns': chartPoints.length }}>{chartPoints.map((point, index) => <div className="bar-slot" key={point.date} title={`${formatDate(point.date, { dateOnly: true })}${bucketSize > 1 ? `–${formatDate(point.endDate, { dateOnly: true })}` : ''} · ${formatNumber(values[index])} submissions\n${outcomes.map(({ field, label }) => `${label} ${formatNumber(point[field])}`).join(' · ')}`}><div className="bar-stack">{outcomes.map(({ field }) => <span className={field} key={field} style={{ height: `${point[field] / maximum * 100}%` }} />)}</div></div>)}</div></div>
      <div className="axis-dates" style={{ '--columns': chartPoints.length }}>{labels.map((label, index) => <span key={chartPoints[index].date} className={chartPoints.length > 7 && index % 2 !== 0 && index !== chartPoints.length - 1 ? 'alternate' : ''}>{label}</span>)}</div>
    </div> : <div className="chart-empty">No workspace submissions in this period.</div>}
    <div className="chart-footer"><div className="legend">{outcomes.map(({ field, label }) => <span key={field}><i className={field} />{label}</span>)}</div><details className="chart-data"><summary>Chart data</summary><div className="table-wrap"><table className="data-table chart-table"><caption className="sr-only">{title} by UTC day{bucketSize > 1 ? `. Chart bars group ${bucketSize} consecutive days.` : ''}</caption><thead><tr><th scope="col">UTC day</th>{outcomes.map(({ label }) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{points.map((point) => <tr key={point.date}><th scope="row">{formatDate(point.date, { dateOnly: true })}</th>{outcomes.map(({ field }) => <td key={field}>{formatNumber(point[field])}</td>)}</tr>)}</tbody></table></div></details></div>
  </section>
}

export function AccessBadge({ status }) {
  return <span className={`badge ${status === 'suspended' ? 'rose' : 'green'}`}><i aria-hidden="true" />{status === 'suspended' ? 'Suspended' : 'Active'}</span>
}

export function CompanyMark({ company }) {
  const name = company?.name || 'Company'
  const tone = ['violet', 'blue', 'amber', 'rose', 'green'][name.codePointAt(0) % 5]
  return <span className={`company-mark ${tone}`} aria-hidden="true">{name.slice(0, 1).toLocaleUpperCase()}</span>
}

export function OnboardingLabel({ status }) {
  const ready = status === 'ready'
  const Icon = ready ? CheckCircle2 : Clock3
  return <span className={`setup-label ${ready ? 'complete' : ''}`}><Icon aria-hidden="true" />{{ ready: 'Ready', setup_incomplete: 'Setup incomplete', awaiting_admin: 'Awaiting admin' }[status] || 'Setup incomplete'}</span>
}

function SubmissionTrend({ series = [] }) {
  const group = Math.max(1, Math.ceil(series.length / 10))
  const values = []
  for (let index = 0; index < series.length; index += group) values.push(series.slice(index, index + group).reduce((sum, point) => sum + totalPoint(point), 0))
  const peak = Math.max(0, ...values)
  return peak ? <span className="spark" aria-hidden="true">{values.map((value, index) => <i key={index} style={{ height: `${value ? Math.max(12, value / peak * 100) : 0}%` }} />)}</span> : <span className="muted" aria-hidden="true">—</span>
}

export function CompanyTable({ items = [] }) {
  return <><p className="table-hint">Scroll across the table for usage and violations.</p><div className="table-wrap" tabIndex={0} role="region" aria-label="Company results"><table className="data-table company-table"><thead><tr><th scope="col">Company</th><th scope="col">Access</th><th scope="col">Onboarding</th><th scope="col" className="usage-column">Workspace runs</th><th scope="col">Last submission</th><th scope="col" className="align-right">Open violations</th></tr></thead><tbody>{items.map((company) => <tr key={company.id}><th scope="row"><a className="company-link" href={`#platform-company?id=${encodeURIComponent(company.id)}`}><CompanyMark company={company} /><span><strong>{company.name}</strong><small>{company.slug}</small></span></a></th><td><AccessBadge status={company.status} /></td><td><OnboardingLabel status={company.onboarding} /></td><td><div className="usage-cell"><strong>{formatNumber(company.workspace_runs)}</strong><SubmissionTrend series={company.series} /></div></td><td><time dateTime={company.last_workspace_submission || undefined} title={formatDate(company.last_workspace_submission)}>{company.last_workspace_submission ? formatDate(company.last_workspace_submission, { relative: true }) : 'No submissions'}</time></td><td className="align-right"><span className={company.open_violations ? 'violation-count' : 'muted'}>{formatNumber(company.open_violations)}</span></td></tr>)}</tbody></table></div></>
}

export function AuditTable({ items = [], companyDetail = false }) {
  if (!items.length) return <EmptyState title="No matching events" description="Try a different filter or check back after a company change." />
  return <div className="table-wrap" tabIndex={0} role="region" aria-label="Audit events"><table className="data-table audit-table"><thead><tr><th scope="col">Event</th>{!companyDetail && <th scope="col">Company</th>}<th scope="col">Actor</th><th scope="col">Recorded · UTC</th><th scope="col">Request ID</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><th scope="row"><strong>{item.event}</strong>{item.reason && <small>{item.reason}</small>}</th>{!companyDetail && <td><a href={`#platform-company?id=${encodeURIComponent(item.company_id)}`}>{item.company_name}</a></td>}<td>{item.actor_name}</td><td><time dateTime={item.created_at}>{formatDate(item.created_at)}</time></td><td className="request-id">{item.request_id || '—'}</td></tr>)}</tbody></table></div>
}

export function Pagination({ page, pageSize = 20, total = 0, onPageChange, noun = 'companies' }) {
  const start = (page - 1) * pageSize
  return <footer className="pagination"><span role="status">{total ? `${formatNumber(Math.min(start + 1, total))}–${formatNumber(Math.min(start + pageSize, total))} of ${formatNumber(total)} ${noun}` : `0 ${noun}`}</span><div><button type="button" className="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button><button type="button" className="button" disabled={start + pageSize >= total} onClick={() => onPageChange(page + 1)}>Next</button></div></footer>
}

function attentionIcon(kind) {
  if (/violation/.test(kind)) return ShieldAlert
  if (/admin|invitation/.test(kind)) return Mail
  if (/integration|provider/.test(kind)) return Plug
  if (/policy/.test(kind)) return ShieldAlert
  return CircleAlert
}

export function AttentionPanel({ items = [], total = items.length }) {
  return <section className="panel attention-panel" aria-labelledby="platform-attention-title"><div className="panel-head"><div><h2 id="platform-attention-title">Needs attention</h2><p>Company issues to review</p></div><span className="count-chip">{formatNumber(total)} open</span></div>{items.length ? <ul className="issue-list">{items.map((issue) => {
    const Icon = attentionIcon(issue.kind)
    return <li key={issue.id}><a href={`#platform-company?id=${encodeURIComponent(issue.company_id)}`} className="issue"><span className={`issue-icon ${issue.tone || 'amber'}`}><Icon aria-hidden="true" /></span><span className="issue-body"><strong>{issue.title}</strong><span>{issue.company_name}{issue.occurred_at ? ` · ${formatDate(issue.occurred_at, { relative: true })}` : ''}</span><small>{issue.description}</small></span><ChevronRight aria-hidden="true" /></a></li>
  })}</ul> : <div className="attention-empty"><CheckCircle2 aria-hidden="true" /><strong>No current issues</strong><p>Company issues appear here when recorded state needs attention.</p></div>}</section>
}

export function AttentionBanners({ items = [] }) {
  return items.map((issue) => {
    const Icon = attentionIcon(issue.kind)
    return <div className="issue-banner" key={issue.id}><span className={`issue-icon ${issue.tone || 'amber'}`}><Icon aria-hidden="true" /></span><div><strong>{issue.title}</strong><p>{issue.description}</p></div></div>
  })
}

export function LoadingState({ label = 'Loading platform data…' }) {
  return <div className="platform-loading panel" role="status" aria-live="polite"><Activity aria-hidden="true" /><span>{label}</span></div>
}

export function ErrorState({ error, onRetry }) {
  return <div className="platform-error panel" role="alert"><CircleAlert aria-hidden="true" /><div><strong>Could not load this view</strong><p>{typeof error === 'string' ? error : error?.message || 'The service is temporarily unavailable. Try again.'}</p>{onRetry && <button type="button" className="button" onClick={onRetry}>Try again</button>}</div></div>
}

export function EmptyState({ title, description, children }) {
  return <div className="empty"><h2>{title}</h2>{description && <p>{description}</p>}{children}</div>
}

export function CompanyActivityPanel({ companies = [] }) {
  return <section className="panel directory-panel" aria-labelledby="platform-company-activity"><div className="panel-head"><div><h2 id="platform-company-activity">Company activity</h2><p>Most workspace submissions in the selected period</p></div><a className="button" href="#platform-companies">View all companies<ArrowUpRight aria-hidden="true" /></a></div>{companies.length ? <CompanyTable items={companies} /> : <EmptyState title="No companies yet" description="Companies appear here after registration." />}</section>
}
