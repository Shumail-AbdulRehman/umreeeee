import { useEffect, useRef, useState } from 'react'
import { listGroups } from '../services/groups/groupService'
import { createManagedUser, fetchManagedUsers, resendManagedInvitation, setManagedUserStatus, updateManagedUser } from '../services/users/userManagementService'
import Modal from '../components/Modal'
import FieldErrors from '../components/FieldErrors'

const blank = { first_name: '', last_name: '', email: '', department: '', role: 'user', group_ids: [] }

export default function UsersPage({ currentUser, openCreateUser = false }) {
  const requestSequence = useRef(0)
  const [result, setResult] = useState({ items: [], total: 0, page_size: 20 })
  const [groups, setGroups] = useState([])
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [editing, setEditing] = useState(openCreateUser ? {} : null)
  const [form, setForm] = useState(blank)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function refresh() {
    const requestId = ++requestSequence.current
    const params = new URLSearchParams({ page: String(page), q: query })
    if (statusFilter) params.set('status', statusFilter)
    if (roleFilter) params.set('role', roleFilter)
    if (groupFilter) params.set('group_id', groupFilter)
    try { const value = await fetchManagedUsers(`?${params}`)
      if (requestId === requestSequence.current) { setResult(value); setError('') } }
    catch (problem) { if (requestId === requestSequence.current) setError(problem.message) }
  }
  useEffect(() => { void Promise.resolve().then(refresh) }, [page, query, statusFilter, roleFilter, groupFilter]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { listGroups('?page_size=100&status=active').then((value) => setGroups(value.items)).catch((problem) => setError(problem.message)) }, [])

  function open(item = null) {
    setEditing(item || {})
    setForm(item ? { first_name: item.first_name, last_name: item.last_name, email: item.email,
      department: item.department, role: item.role, group_ids: item.group_ids, version: item.version } : structuredClone(blank))
    setError('')
    setFieldErrors({})
  }
  async function save(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const response = editing?.id ? await updateManagedUser(editing.id, form) : await createManagedUser(form)
      setMessage(response.message); setEditing(null); setFieldErrors({}); await refresh()
    } catch (problem) { setError(problem.message); setFieldErrors(problem.fieldErrors || {}) }
    finally { setBusy(false) }
  }
  async function toggle(item) {
    if (item.is_active && !window.confirm(`Deactivate ${item.first_name} ${item.last_name}? Their sessions will end.`)) return
    setBusy(true)
    try { const response = await setManagedUserStatus(item.id, !item.is_active, item.version); setMessage(response.message); await refresh() }
    catch (problem) { setError(problem.message) }
    finally { setBusy(false) }
  }
  async function resend(item) {
    setBusy(true)
    try { const response = await resendManagedInvitation(item.id); setMessage(response.message); await refresh() }
    catch (problem) { setError(problem.message) }
    finally { setBusy(false) }
  }

  return <div className="admin-stack">
    <div className="admin-toolbar"><input aria-label="Search users" placeholder="Search users" value={query} onChange={(event) => { setPage(1); setQuery(event.target.value) }} />
      <select aria-label="Filter user status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}><option value="">All statuses</option>{['active', 'invited', 'pending_verification', 'inactive'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select>
      <select aria-label="Filter user role" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1) }}><option value="">All roles</option><option value="org_admin">Organization admin</option><option value="user">User</option><option value="super_admin">Super Admin</option></select>
      <select aria-label="Filter user group" value={groupFilter} onChange={(event) => { setGroupFilter(event.target.value); setPage(1) }}><option value="">All groups</option>{groups.map((group) => <option key={group._id} value={group._id}>{group.name}</option>)}</select>
      <button className="btn primary" onClick={() => open()}>Invite user</button></div>
    {message && <div className="admin-notice" role="status">{message}</div>}{error && <div className="admin-error" role="alert">{error}</div>}
    {result.items.length === 0 ? <div className="admin-panel">No users found.</div> : <div className="admin-panel admin-scroll"><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Groups</th><th>Status</th><th>Actions</th></tr></thead><tbody>{result.items.map((item) =>
      <tr key={item.id}><td><strong>{item.first_name} {item.last_name}</strong><small>{item.department}</small></td><td>{item.email}</td><td>{item.role}</td><td>{item.group_ids.length}</td><td>{item.account_status}{item.account_status === 'invited' && item.invitation_delivery_status === 'failed' && <small>Delivery failed</small>}</td><td>{item.id === currentUser.id ? 'Current account' : <><button className="btn" onClick={() => open(item)}>Edit</button> <button className="btn" disabled={busy} onClick={() => toggle(item)}>{item.is_active ? 'Deactivate' : 'Reactivate'}</button> {item.account_status === 'invited' && <button className="btn" disabled={busy} onClick={() => resend(item)}>Resend</button>}</>}</td></tr>)}
    </tbody></table></div>}
    <div className="admin-pagination"><span>{result.total} users</span><button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="btn" disabled={page * result.page_size >= result.total} onClick={() => setPage(page + 1)}>Next</button></div>
    {editing && <Modal title={editing.id ? 'Edit user' : 'Invite user'} onClose={() => setEditing(null)} dirty><form onSubmit={save} className="admin-stack"><div className="admin-grid two"><label>First name<input autoFocus required minLength="2" value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} /><FieldErrors errors={fieldErrors} field="first_name" /></label><label>Last name<input required minLength="2" value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} /><FieldErrors errors={fieldErrors} field="last_name" /></label></div><label>Email<input type="email" required disabled={Boolean(editing.id && editing.account_status !== 'invited')} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /><FieldErrors errors={fieldErrors} field="email" /></label>{editing.id && editing.account_status !== 'invited' && <p>Verified email changes are not supported here.</p>}<label>Department<input required minLength="2" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /><FieldErrors errors={fieldErrors} field="department" /></label><label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="user">User</option><option value="org_admin">Organization admin</option></select><FieldErrors errors={fieldErrors} field="role" /></label><fieldset><legend>Groups</legend><div className="admin-options">{groups.length ? groups.map((group) => <label key={group._id}><input type="checkbox" checked={form.group_ids.includes(group._id)} onChange={() => setForm({ ...form, group_ids: form.group_ids.includes(group._id) ? form.group_ids.filter((id) => id !== group._id) : [...form.group_ids, group._id] })} /> {group.name}</label>) : 'No groups yet'}</div><FieldErrors errors={fieldErrors} field="group_ids" /></fieldset>
      {error && <div className="admin-error" role="alert">{error}</div>}<div className="admin-actions"><button type="button" className="btn" disabled={busy} onClick={() => setEditing(null)}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : editing.id ? 'Save user' : 'Create invitation'}</button></div></form></Modal>}
  </div>
}
