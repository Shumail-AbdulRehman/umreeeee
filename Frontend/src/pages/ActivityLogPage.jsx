import { useEffect, useState } from 'react'
import { fetchPromptWorkspaceRun, fetchPromptWorkspaceRuns } from '../services/promptWorkspace/promptWorkspaceService'

export default function ActivityLogPage({ runId = '', filterStatus = '' }) {
  const [page, setPage] = useState(1)
  const [result, setResult] = useState({ items: [], total: 0, page_size: 20 })
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { fetchPromptWorkspaceRuns(page, filterStatus).then(setResult).catch((problem) => setError(problem.message)) }, [page, filterStatus])
  useEffect(() => { if (runId) fetchPromptWorkspaceRun(runId).then((value) => setDetail(value.run)).catch((problem) => setError(problem.message)) }, [runId])
  async function open(id) { try { setDetail((await fetchPromptWorkspaceRun(id)).run) } catch (problem) { setError(problem.message) } }
  return <div className="admin-stack">{error && <div className="admin-error" role="alert">{error}</div>}
    <div className="admin-toolbar"><label>Run status <select value={filterStatus} onChange={(event) => { setPage(1); window.location.hash = event.target.value ? `activity-log?status=${encodeURIComponent(event.target.value)}` : 'activity-log' }}><option value="">All statuses</option>{['allowed', 'blocked_input', 'blocked_output', 'provider_error', 'validation_error', 'configuration_error', 'interrupted'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label></div>
    <section className="admin-panel"><h2>Prompt activity</h2>{result.items.length === 0 ? <p>No runs recorded.</p> : <div className="admin-scroll"><table className="admin-table"><thead><tr><th>When</th><th>User</th><th>Provider</th><th>Model</th><th>Status</th><th>Tokens</th><th>Cost estimate</th><th>Detail</th></tr></thead><tbody>{result.items.map((row) => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.user_name}</td><td>{row.provider}</td><td>{row.model}</td><td>{row.status}</td><td>{row.total_tokens ?? 'Unknown'}</td><td>{row.estimated_cost_usd == null ? 'Unknown' : `$${row.estimated_cost_usd}`}</td><td><button className="btn" onClick={() => open(row.id)}>Open</button></td></tr>)}</tbody></table></div>}
      <div className="admin-pagination"><span>{result.total} runs</span><button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="btn" disabled={page * result.page_size >= result.total} onClick={() => setPage(page + 1)}>Next</button></div></section>
    {detail && <section className="admin-panel admin-stack"><h2>Run {detail.id}</h2><p>Status: {detail.status.replaceAll('_', ' ')}</p>{detail.error_message && <p>{detail.error_message}</p>}{detail.content_expired && <p>Stored content expired; audit metadata remains.</p>}{detail.prompt != null && <pre className="admin-response">{detail.prompt}</pre>}{detail.response_withheld ? <p>Generated response withheld.</p> : detail.response_text && <pre className="admin-response">{detail.response_text}</pre>}<p><a href={`#prompt-studio?run_id=${encodeURIComponent(detail.id)}`}>Open full decision detail</a></p></section>}
  </div>
}
