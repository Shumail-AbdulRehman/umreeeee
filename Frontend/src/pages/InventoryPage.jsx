import { useEffect, useRef, useState } from 'react'
import { createGroup, listGroups, setGroupStatus, updateGroup } from '../services/groups/groupService'
import Modal from '../components/Modal'
import FieldErrors from '../components/FieldErrors'

export default function InventoryPage() {
  const requestSequence = useRef(0)
  const [result, setResult] = useState({ items: [], total: 0, page: 1, page_size: 20 })
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', description: '' })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  async function refresh() {
    const requestId = ++requestSequence.current
    setLoading(true)
    try {
      const data = await listGroups(`?page=${page}&q=${encodeURIComponent(query)}`)
      if (requestId === requestSequence.current) { setResult(data); setError('') }
    } catch (problem) { if (requestId === requestSequence.current) setError(problem.message) }
    finally { if (requestId === requestSequence.current) setLoading(false) }
  }
  useEffect(() => { void Promise.resolve().then(refresh) }, [page, query]) // eslint-disable-line react-hooks/exhaustive-deps

  function open(group = null) {
    setEditing(group || {})
    setForm({ name: group?.name || '', description: group?.description || '' })
    setError('')
    setFieldErrors({})
  }
  async function save(event) {
    event.preventDefault()
    setBusy(true)
    try {
      if (editing?._id) await updateGroup(editing._id, { ...form, version: editing.version })
      else await createGroup(form)
      setEditing(null)
      setFieldErrors({})
      await refresh()
    } catch (problem) { setError(problem.message); setFieldErrors(problem.fieldErrors || {}) }
    finally { setBusy(false) }
  }
  async function toggle(group) {
    const target = group.status === 'active' ? 'archived' : 'active'
    if (target === 'archived' && !window.confirm(`Archive ${group.name}? Members and policy references must be removed first.`)) return
    setBusy(true)
    try { await setGroupStatus(group._id, { status: target, version: group.version }); await refresh() }
    catch (problem) { setError(problem.message) }
    finally { setBusy(false) }
  }

  return <div className="admin-stack">
    <div className="admin-toolbar"><input aria-label="Search groups" placeholder="Search groups" value={query} onChange={(event) => { setPage(1); setQuery(event.target.value) }} />
      <button className="btn primary" onClick={() => open()}>New group</button></div>
    {error && <div className="admin-error" role="alert">{error}</div>}
    {loading ? <p>Loading groups…</p> : result.items.length === 0 ? <p className="admin-panel">No groups found. Create one to organize people.</p> :
      <div className="admin-panel admin-scroll"><table className="admin-table"><thead><tr><th>Name</th><th>Members</th><th>Policies</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead><tbody>
        {result.items.map((group) => <tr key={group._id}><td><strong>{group.name}</strong><small>{group.description}</small></td><td>{group.member_count}</td><td><span>{group.policy_count || 0} assigned</span>{group.status === 'active' && <small><a href={`#dlp-policy?group_id=${encodeURIComponent(group._id)}`}>Edit DLP</a> · <a href={`#guardrail-policy?group_id=${encodeURIComponent(group._id)}`}>Edit Guardrail</a></small>}</td><td>{group.status}</td><td>{new Date(group.updated_at).toLocaleDateString()}</td><td><button className="btn" onClick={() => open(group)}>Edit</button> <button className="btn" disabled={busy} onClick={() => toggle(group)}>{group.status === 'active' ? 'Archive' : 'Restore'}</button></td></tr>)}
      </tbody></table></div>}
    <div className="admin-pagination"><span>{result.total} groups</span><button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="btn" disabled={page * result.page_size >= result.total} onClick={() => setPage(page + 1)}>Next</button></div>
    {editing && <Modal title={editing._id ? 'Edit group' : 'New group'} onClose={() => setEditing(null)} dirty={Boolean(form.name || form.description)}><form onSubmit={save} className="admin-stack"><label>Name<input autoFocus required minLength="2" maxLength="80" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><FieldErrors errors={fieldErrors} field="name" /></label><label>Description<textarea maxLength="1000" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /><FieldErrors errors={fieldErrors} field="description" /></label>
      {error && <div className="admin-error" role="alert">{error}</div>}
      <div className="admin-actions"><button type="button" className="btn" onClick={() => setEditing(null)} disabled={busy}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save group'}</button></div></form></Modal>}
  </div>
}
