import { useEffect, useState } from 'react'
import { Activity, ArrowUpRight, Bot, CircleDollarSign, Clock3, MessageSquarePlus, RefreshCw, ShieldCheck, UserRound, Zap } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { getModels, getSeries, getSummary } from '../services/observability'
import { apiRequest } from '../services/api/client'
import AnalyticsChart from '../components/AnalyticsChart'
import DataTable from '../components/DataTable'
import LoadingSurface from '../components/LoadingSurface'
import StatusBadge from '../components/StatusBadge'
import { EmptyState, SectionHeader, StatCard } from '../components/Surface'
import { Button } from '../components/ui/button'
import { formatDate, formatMoney, formatNumber, formatPercent } from '../lib/format'
import { dailyOutcomes, executionOutcomes, insightParams } from './user-insights-data'
import './my-activity.css'

function OutcomeTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  return <div className="chart-tooltip"><strong>{item.label}</strong>{formatNumber(item.count)} runs</div>
}

function MyOutcomes({ summary }) {
  const total = Number(summary.total_submissions || 0)
  const outcomes = executionOutcomes(summary)
  const other = Math.max(0, total - outcomes.reduce((sum, item) => sum + item.count, 0))
  if (other) outcomes.push({ label: 'Other outcomes', count: other, color: 'var(--chart-3)' })
  const visible = outcomes.filter((item) => item.count > 0)
  return <section className="analytics-surface my-activity-outcomes">
    <SectionHeader title="Your outcomes" description="How your submitted prompts finished." />
    {total ? <>
      <div className="my-activity-ring" role="img" aria-label={formatNumber(total) + ' prompt runs. Counts and percentages are listed below.'}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart><Pie data={visible} dataKey="count" nameKey="label" innerRadius="75%" outerRadius="95%" paddingAngle={visible.length > 1 ? 3 : 0} stroke="var(--panel)" strokeWidth={2} isAnimationActive={false}>
            {visible.map((item) => <Cell key={item.label} fill={item.color} />)}
          </Pie><Tooltip content={<OutcomeTooltip />} /></PieChart>
        </ResponsiveContainer>
        <div className="my-activity-ring-center" aria-hidden="true"><strong>{formatPercent(Number(summary.allowed || 0) / total)}</strong><span>allowed</span></div>
      </div>
      <ul className="my-activity-outcome-list">{outcomes.map((item) => <li key={item.label}><span><i style={{ background: item.color }} aria-hidden="true" />{item.label}</span><strong>{formatNumber(item.count)}</strong><small>{formatPercent(item.count / total)}</small></li>)}</ul>
      <p className="my-activity-chart-note">Technical errors are separate from policy blocks.</p>
    </> : <EmptyState icon={ShieldCheck} title="No outcomes yet" description="Your recorded prompt outcomes will appear here." />}
  </section>
}

export default function MyActivityPage({ currentUser }) {
  const [days, setDays] = useState(7)
  const [refresh, setRefresh] = useState(0)
  const [report, setReport] = useState({ key: '', data: null, error: '' })
  const userId = currentUser?.id || ''
  const key = userId + ':' + days + ':' + refresh

  useEffect(() => {
    if (!userId) return
    let active = true
    const params = insightParams(days, userId)
    const runsQuery = params.query + '&page=1&page_size=5'
    Promise.all([getSummary(params.query), getSeries(params.query), getModels(params.query),
      apiRequest('/prompt-workspace/runs' + runsQuery)])
      .then(([summary, series, models, recent]) => {
        if (active) setReport({ key, error: '', data: { summary, series: series.items || [], models: models.items || [], recent: recent.items || [], ...params } })
      })
      .catch((error) => { if (active) setReport({ key, data: null, error: error.message }) })
    return () => { active = false }
  }, [userId, days, refresh, key])

  const current = report.key === key ? report : null
  const data = current?.data
  const loading = Boolean(userId) && !current
  const summary = data?.summary
  const total = Number(summary?.total_submissions || 0)
  const knownTokens = Number(summary?.known_prompt_tokens || 0) + Number(summary?.known_completion_tokens || 0)
  const unknownCost = Number(summary?.unknown_cost_runs || 0)
  const costAvailable = total === 0 || unknownCost < total || Number(summary?.estimated_cost_usd) > 0
  const activity = data ? dailyOutcomes(data.series, summary.filters?.from || data.from, summary.filters?.to || data.to) : []
  const modelUsage = data ? [...data.models].sort((a, b) => b.runs - a.runs).slice(0, 5).map((item) => ({
    label: (item.model || 'Unspecified model') + ' · ' + (item.provider || 'Unknown provider'), runs: item.runs,
  })) : []
  const typicalTime = summary?.latency?.total_latency_ms

  return <div className="my-activity-page">
    <div className="my-activity-toolbar">
      <p className="my-activity-scope"><UserRound size={15} aria-hidden="true" />Only your activity</p>
      <div className="my-activity-actions">
        <label className="my-activity-period"><span className="sr-only">Activity reporting period</span><select value={days} onChange={(event) => setDays(Number(event.target.value))}>{[7, 30, 90].map((period) => <option key={period} value={period}>Last {period} days · UTC</option>)}</select></label>
        <Button variant="outline" type="button" disabled={loading || !userId} onClick={() => setRefresh((value) => value + 1)} aria-label="Refresh my activity"><RefreshCw size={14} aria-hidden="true" /><span>Refresh</span></Button>
        <Button asChild><a href="#prompt-studio"><MessageSquarePlus size={15} aria-hidden="true" />New conversation</a></Button>
      </div>
    </div>
    {!userId ? <div className="admin-error" role="alert">Your account could not be identified. Reload the page to restore your session.</div>
      : loading ? <LoadingSurface kind="my-activity" label="Loading your activity…" />
      : current?.error ? <div className="my-activity-error" role="alert"><Activity size={22} aria-hidden="true" /><div><h2>Could not load your activity</h2><p>{current.error}</p></div><Button variant="outline" onClick={() => setRefresh((value) => value + 1)}>Retry activity</Button></div>
      : data && <>
        <section className="stat-grid my-activity-metrics" aria-label="Your activity summary">
          <StatCard title="Your prompt runs" value={formatNumber(total)} description={'Submitted in the selected ' + days + ' days'} icon={Activity} />
          <StatCard title="Allowed share" value={total ? formatPercent(Number(summary.allowed || 0) / total) : '—'} description={formatNumber(summary.allowed) + ' allowed · ' + formatNumber(summary.blocked) + ' blocked'} icon={ShieldCheck} />
          <StatCard title="Known tokens" value={formatNumber(knownTokens)} description={formatNumber(summary.unknown_usage_runs) + ' runs with unreported usage'} icon={Zap} />
          <StatCard title="Known estimated spend" value={formatMoney(costAvailable ? summary.estimated_cost_usd : null)} description={formatNumber(unknownCost) + ' runs with unknown or partial cost'} icon={CircleDollarSign} />
        </section>
        {!total && <section className="my-activity-first-run"><div><MessageSquarePlus size={22} aria-hidden="true" /><div><h2>No activity in this period</h2><p>Start a conversation or choose a longer period to see your usage.</p></div></div><a href="#prompt-studio">Open Prompt Studio <ArrowUpRight size={14} aria-hidden="true" /></a></section>}
        <div className="my-activity-main-grid">
          <AnalyticsChart title="Your daily activity" description="Prompt submissions by outcome · UTC" data={activity}
            series={[{ key: 'allowed', label: 'Allowed' }, { key: 'blocked', label: 'Blocked' }, { key: 'errors', label: 'Technical errors', color: 'var(--ink-3)' }, { key: 'processing', label: 'Processing' }, ...(activity.some((item) => item.other > 0) ? [{ key: 'other', label: 'Other', color: 'var(--chart-3)' }] : [])]}
            stacked height={260} emptyDescription="No daily activity recorded in the selected period." />
          <MyOutcomes summary={summary} />
        </div>
        <div className="my-activity-detail-grid">
          <AnalyticsChart title="Models you use" description="Your five most-used provider and model pairs." data={modelUsage} horizontal height={230} series={[{ key: 'runs', label: 'Prompt runs' }]} emptyDescription="The models you use will appear after you submit a prompt." />
          <section className="analytics-surface my-activity-usage">
            <SectionHeader title="Usage details" description="Recorded measurements for the same period." />
            <dl>
              <div><dt><Bot size={15} aria-hidden="true" />Models used</dt><dd>{formatNumber(data.models.length)}</dd></div>
              <div><dt><Clock3 size={15} aria-hidden="true" />Typical execution time</dt><dd>{typicalTime?.p50 == null ? 'No data' : formatNumber(Math.round(typicalTime.p50)) + ' ms'}</dd></div>
              <div><dt>Input tokens</dt><dd>{formatNumber(summary.known_prompt_tokens)}</dd></div>
              <div><dt>Output tokens</dt><dd>{formatNumber(summary.known_completion_tokens)}</dd></div>
              <div><dt>Policy incidents</dt><dd>{formatNumber(summary.violation_events)}</dd></div>
            </dl>
            <p>Token totals include known measurements. Spend is an estimate, and may be incomplete when a provider does not report usage or pricing is unavailable.</p>
          </section>
        </div>
        <DataTable title="Your recent activity" description="Your latest five prompt runs in the selected period." rows={data.recent}
          emptyTitle="No recent prompts" emptyDescription="Your submitted prompts will appear here with their recorded outcomes."
          columns={[
            { id: 'submitted', label: 'Submitted', value: (row) => row.created_at, render: (row) => formatDate(row.created_at) },
            { id: 'model', label: 'Model', value: (row) => row.model, render: (row) => <><strong>{row.model || 'Unspecified model'}</strong><small>{row.provider || 'Unknown provider'}</small></> },
            { id: 'outcome', label: 'Outcome', value: (row) => row.status, render: (row) => <StatusBadge status={row.status} /> },
            { id: 'tokens', label: 'Tokens', value: (row) => row.total_tokens, render: (row) => formatNumber(row.total_tokens) },
            { id: 'detail', label: 'Detail', required: true, render: (row) => <a className="my-activity-run-link" href={'#prompt-studio?run_id=' + encodeURIComponent(row.id)}>View run <ArrowUpRight size={13} aria-hidden="true" /></a> },
          ]} />
        <footer className="my-activity-footer"><div><p>{days}-day reporting interval · UTC · boundary dates may include partial days.</p><p>{formatNumber(summary.legacy_history_count || 0)} legacy records excluded from these analytics.{summary.generated_at && ' Updated ' + formatDate(summary.generated_at) + '.'}</p></div><a href="#activity-log">View full activity history <ArrowUpRight size={14} aria-hidden="true" /></a></footer>
      </>}
  </div>
}
