import { useEffect, useState } from 'react'
import { getViolation, listViolations, resolveViolation } from '../services/observability'
import { isAdmin } from '../utils/permissions'

export default function ViolationsPage({ currentUser }) {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [result, setResult] = useState({ items: [], total: 0, page_size: 20 })
  const [selected, setSelected] = useState(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function refresh() { setResult(await listViolations(`?${new URLSearchParams({ page: String(page), status })}`)) }
  useEffect(() => { void Promise.resolve().then(refresh).catch((problem) => setError(problem.message)) }, [page, status]) // eslint-disable-line react-hooks/exhaustive-deps
  async function open(id) { try { const item = (await getViolation(id)).violation; setSelected(item); setNote(item.resolution_note || ''); setError('') } catch (problem) { setError(problem.message) } }
  async function save(next) {
    setBusy(true)
    try { const value = await resolveViolation(selected.id, { resolution_status: next, note, version: selected.version }); setSelected(value.violation); await refresh(); setError('') }
    catch (problem) { setError(problem.message) }
    finally { setBusy(false) }
  }
  return <div className="admin-stack"><div className="admin-toolbar"><p>Recorded policy matches. A validator error alone is not a violation.</p><select aria-label="Filter resolution" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="">All resolutions</option><option value="open">Open</option><option value="reviewed">Reviewed</option><option value="resolved">Resolved</option></select></div>
    {error && <div className="admin-error" role="alert">{error}</div>}
    <section className="admin-panel"><h2>Violations</h2>{result.items.length === 0 ? <p>No policy matches in this view.</p> : <div className="admin-scroll"><table className="admin-table"><thead><tr><th>When</th><th>Severity</th><th>Policy</th><th>Action</th><th>Stage</th><th>Resolution</th><th>Detail</th></tr></thead><tbody>{result.items.map((item) => <tr key={item.id}><td>{new Date(item.created_at).toLocaleString()}</td><td>{item.severity}</td><td>{item.policy_name}</td><td>{item.action}</td><td>{item.stage}</td><td>{item.resolution_status}</td><td><button className="btn" onClick={() => open(item.id)}>Open</button></td></tr>)}</tbody></table></div>}
      <div className="admin-pagination"><span>{result.total} violations</span><button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="btn" disabled={page * result.page_size >= result.total} onClick={() => setPage(page + 1)}>Next</button></div></section>
    {selected && <section className="admin-panel admin-stack"><div className="admin-toolbar"><h2>{selected.policy_name} · {selected.stage}</h2><button className="btn" onClick={() => setSelected(null)}>Close</button></div><p>{selected.category} · {selected.severity} · {selected.action} · policy version {selected.policy_version}</p><p>Safe evidence: {selected.findings?.map((item) => `${item.type} in ${item.field}`).join(', ') || 'None'}. Matched text is never shown here.</p><p><a href={`#prompt-studio?run_id=${encodeURIComponent(selected.run_id)}`}>Open this run’s safe detail</a></p>
      {isAdmin(currentUser) && <><label>Review note<textarea maxLength="2000" value={note} onChange={(event) => setNote(event.target.value)} /></label><div className="admin-actions"><button className="btn" disabled={busy} onClick={() => save('reviewed')}>Mark reviewed</button><button className="btn primary" disabled={busy} onClick={() => save('resolved')}>Resolve</button></div></>}</section>}
  </div>
}
