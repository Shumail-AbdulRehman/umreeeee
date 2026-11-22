import { useEffect, useState } from 'react'
import { Clock3, Gauge, Timer } from 'lucide-react'
import { getSummary } from '../services/observability'
import AnalyticsChart from '../components/AnalyticsChart'
import DataTable from '../components/DataTable'
import { StatCard } from '../components/Surface'
import { formatNumber } from '../lib/format'
const labels = { provider_latency_ms: 'Provider', enforcement_latency_ms: 'Policy checks', total_latency_ms: 'Total execution' }
const ms = (value) => value == null ? 'No data' : `${Number(value).toLocaleString([], { maximumFractionDigits: 1 })} ms`
export default function LatencyPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { getSummary().then(setData).catch((problem) => setError(problem.message)) }, [])
  const rows = Object.entries(data?.latency || {}).map(([name, row]) => ({ ...row, id: name, label: labels[name] || name.replaceAll('_', ' ') }))
  const measured = rows.filter((row) => row.count > 0)
  return <div className="admin-stack">{error && <div className="admin-error" role="alert">{error}</div>}<section className="report-stat-grid"><StatCard title="Typical total time · p50" value={ms(data?.latency?.total_latency_ms?.p50)} description="Half of measured runs finished within this time" icon={Clock3} /><StatCard title="Total time · p95" value={ms(data?.latency?.total_latency_ms?.p95)} description="95% of measured runs finished within this time" icon={Gauge} /><StatCard title="Policy time · p50" value={ms(data?.latency?.enforcement_latency_ms?.p50)} description="Input and output checks, excluding provider time" icon={Timer} /></section><AnalyticsChart title="Latency by execution stage" description="Compare typical and tail latency from recorded measurements." data={measured} series={[{ key: 'p50', label: 'p50 · typical' }, { key: 'p95', label: 'p95' }, { key: 'p99', label: 'p99 · tail' }]} formatValue={ms} emptyDescription="Latency measurements appear after prompt execution." /><DataTable title="Measurement detail" description="Percentiles are measured values, not performance guarantees. A + indicates a capped sample." rows={rows} emptyTitle="No timing samples" emptyDescription="Run a prompt to record execution timing." columns={[{ id: 'stage', label: 'Stage', value: (row) => row.label, render: (row) => <strong>{row.label}</strong> }, { id: 'count', label: 'Samples', value: (row) => row.count, render: (row) => `${formatNumber(row.count)}${row.sample_capped ? '+' : ''}` }, ...['p50', 'p95', 'p99'].map((key) => ({ id: key, label: key.toUpperCase(), value: (row) => row[key], render: (row) => ms(row[key]) }))]} /><p className="report-footnote">Samples represent recorded runs in the last seven days. Each stage may have a different sample size. Provider, policy, and total measurements are distinct.</p></div>
}
