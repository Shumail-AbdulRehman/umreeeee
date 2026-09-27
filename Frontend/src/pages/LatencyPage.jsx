import { useEffect, useState } from 'react'
import { getSummary } from '../services/observability'

export default function LatencyPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { getSummary().then(setData).catch((problem) => setError(problem.message)) }, [])
  return <div className="admin-stack">{error && <div className="admin-error" role="alert">{error}</div>}<section className="admin-panel"><h2>Observed latency · last seven days</h2><div className="admin-scroll"><table className="admin-table"><thead><tr><th>Stage</th><th>Samples</th><th>p50</th><th>p95</th><th>p99</th></tr></thead><tbody>{Object.entries(data?.latency || {}).map(([name, row]) => <tr key={name}><td>{name.replaceAll('_', ' ')}</td><td>{row.count}{row.sample_capped ? '+' : ''}</td><td>{row.p50 == null ? 'No data' : `${row.p50} ms`}</td><td>{row.p95 == null ? 'No data' : `${row.p95} ms`}</td><td>{row.p99 == null ? 'No data' : `${row.p99} ms`}</td></tr>)}</tbody></table></div></section></div>
}
