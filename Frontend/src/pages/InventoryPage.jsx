import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import { Pagination, SearchInput } from '../components/Surface'
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
    <div className="admin-toolbar"><SearchInput label="Search groups" placeholder="Search groups…" value={query} onChange={(event) => { setPage(1); setQuery(event.target.value) }} />
      <button className="btn primary" onClick={() => open()}>New group</button></div>
    {error && <div className="admin-error" role="alert">{error}</div>}
    {loading ? <div className="table-loading-state" role="status">Loading groups…</div> : <DataTable title="Groups & policy coverage" description="Organize people into teams and manage the policies assigned to each group." rows={result.items} rowKey="_id" emptyTitle="No groups found" emptyDescription="Create a group to organize people and assign their policies." columns={[
      { id: 'name', label: 'Group', value: (group) => group.name, render: (group) => <div className="person-cell"><span className="person-monogram">{group.name?.[0]}</span><div><strong>{group.name}</strong><small>{group.description}</small></div></div> },
      { id: 'members', label: 'Members', value: (group) => group.member_count },
      { id: 'policies', label: 'Policy assignments', value: (group) => group.policy_count || 0, render: (group) => <><span>{group.policy_count || 0} assigned</span>{group.status === 'active' && <small><a href={`#dlp-policy?group_id=${encodeURIComponent(group._id)}`}>Edit DLP</a> · <a href={`#guardrail-policy?group_id=${encodeURIComponent(group._id)}`}>Edit Guardrail</a></small>}</> },
      { id: 'status', label: 'Status', value: (group) => group.status, render: (group) => <StatusBadge status={group.status} /> },
      { id: 'updated', label: 'Updated', value: (group) => group.updated_at, render: (group) => new Date(group.updated_at).toLocaleDateString() },
      { id: 'actions', label: 'Actions', required: true, render: (group) => <div className="table-actions"><button className="btn" onClick={() => open(group)}>Edit</button><button className="btn" disabled={busy} onClick={() => toggle(group)}>{group.status === 'active' ? 'Archive' : 'Restore'}</button></div> },
    ]} />}
    <Pagination page={page} pageSize={result.page_size} total={result.total} onPageChange={setPage} noun="groups" />
    {editing && <Modal title={editing._id ? 'Edit group' : 'New group'} onClose={() => setEditing(null)} dirty={Boolean(form.name || form.description)}><form onSubmit={save} className="admin-stack"><label>Name<input autoFocus required minLength="2" maxLength="80" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><FieldErrors errors={fieldErrors} field="name" /></label><label>Description<textarea maxLength="1000" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /><FieldErrors errors={fieldErrors} field="description" /></label>
      {error && <div className="admin-error" role="alert">{error}</div>}
      <div className="admin-actions"><button type="button" className="btn" onClick={() => setEditing(null)} disabled={busy}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save group'}</button></div></form></Modal>}
  </div>
}
