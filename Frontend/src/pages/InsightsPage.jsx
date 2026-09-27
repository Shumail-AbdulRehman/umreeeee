export default function InsightsPage({ data }) {
  const summary = data?.summary || {}
  const counts = [['Submissions', summary.total_submissions, 'activity-log'], ['Blocked runs', summary.blocked, 'activity-log'],
    ['Violation rate', summary.violation_rate == null ? 'No evaluated runs' : `${(summary.violation_rate * 100).toFixed(1)}%`, 'violations'],
    ['Estimated spend', summary.estimated_cost_usd == null ? 'Unknown' : `$${summary.estimated_cost_usd}`, 'spend']]
  return <div className="admin-stack"><div className="admin-notice" role="status">Results from persisted workspace runs over the last seven days. Allowed means no configured rule blocked the run.</div>
    <section className="admin-panel"><h2>Policy outcomes</h2><dl className="overview-measures">{counts.map(([label, value, route]) => <div key={label}><dt>{label}</dt><dd>{value ?? 0}</dd><a href={`#${route}`}>View</a></div>)}</dl><p>Violation rate uses {summary.violation_rate_denominator ?? 0} terminal runs with a completed rule evaluation. {summary.incomplete_evaluation ?? 0} runs had incomplete evaluation.</p></section>
    <section className="admin-panel"><h2>Daily volume by outcome</h2>{data?.series?.length ? <div className="admin-scroll"><table className="admin-table"><thead><tr><th>UTC day</th><th>Outcome</th><th>Runs</th></tr></thead><tbody>{data.series.map((item) => <tr key={`${item.date}-${item.status}`}><td>{item.date.slice(0, 10)}</td><td>{item.status.replaceAll('_', ' ')}</td><td>{item.count}</td></tr>)}</tbody></table></div> : <p>No runs in this interval.</p>}</section>
    <section className="admin-panel"><h2>Workspace configuration</h2><p>{data?.administration?.users ?? 0} people · {data?.administration?.groups ?? 0} active groups · {data?.administration?.integrations ?? 0} active integrations · {data?.administration?.policies ?? 0} active policies.</p><p>{summary.legacy_history_count ?? 0} legacy records are excluded from security rates.</p></section>
  </div>
}
