import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import { Pagination, SearchInput } from '../components/Surface'
import { useEffect, useRef, useState } from 'react'
import { listGroups } from '../services/groups/groupService'
import { createManagedUser, fetchManagedUsers, resendManagedInvitation, setManagedUserStatus, updateManagedUser, updateOwnGroups, fetchOwnGroups } from '../services/users/userManagementService'
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
  const [ownGroups, setOwnGroups] = useState(null)
  const [ownGroupIds, setOwnGroupIds] = useState([])
  const [ownGroupError, setOwnGroupError] = useState('')
  const [groupsSaved, setGroupsSaved] = useState(false)

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

  async function editOwnGroups() {
    setBusy(true); setOwnGroupError(''); setGroupsSaved(false)
    try {
      const response = await fetchOwnGroups()
      setOwnGroups(response.user); setOwnGroupIds([...response.user.group_ids])
    } catch (problem) { setError(problem.message) }
    finally { setBusy(false) }
  }
  async function saveOwnGroups(event) {
    event.preventDefault(); setBusy(true); setOwnGroupError('')
    try {
      const response = await updateOwnGroups({ group_ids: ownGroupIds, version: ownGroups.version })
      setMessage(response.message); setOwnGroups(null); setGroupsSaved(true); await refresh()
    } catch (problem) { setOwnGroupError(problem.message) }
    finally { setBusy(false) }
  }

  return <div className="admin-stack">
    <div className="admin-toolbar"><SearchInput label="Search users" placeholder="Search people…" value={query} onChange={(event) => { setPage(1); setQuery(event.target.value) }} />
      <select aria-label="Filter user status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}><option value="">All statuses</option>{['active', 'invited', 'pending_verification', 'inactive'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select>
      <select aria-label="Filter user role" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1) }}><option value="">All roles</option><option value="org_admin">Organization admin</option><option value="user">User</option><option value="super_admin">Super Admin</option></select>
      <select aria-label="Filter user group" value={groupFilter} onChange={(event) => { setGroupFilter(event.target.value); setPage(1) }}><option value="">All groups</option>{groups.map((group) => <option key={group._id} value={group._id}>{group.name}</option>)}</select>
      <button className="btn" disabled={busy} onClick={editOwnGroups}>My policy groups</button><button className="btn primary" onClick={() => open()}>Invite user</button></div>
    {message && <div className="admin-notice" role="status">{message}{groupsSaved && <> <a href="#prompt-studio">Return to Prompt Studio ↗</a></>}</div>}{error && <div className="admin-error" role="alert">{error}</div>}
    {ownGroups && <form className="admin-panel admin-stack" onSubmit={saveOwnGroups} aria-label="Manage my policy groups">
      <h2>Manage my groups</h2>
      <p>Policy assignment is optional for admins. Select groups to apply their policies to your Prompt Studio messages.</p>
      <fieldset><legend>My policy groups</legend><div className="admin-options">{groups.length ? groups.map((group) => <label key={group._id}><input type="checkbox" disabled={busy || (!ownGroupIds.includes(group._id) && ownGroupIds.length >= 32)} checked={ownGroupIds.includes(group._id)} onChange={() => setOwnGroupIds((ids) => ids.includes(group._id) ? ids.filter((id) => id !== group._id) : [...ids, group._id])} /> {group.name}</label>) : <p>No active groups are available. <a href="#inventory">Create a group</a>, then <a href="#policies">assign its policies</a>.</p>}</div></fieldset>
      {ownGroupError && <div className="admin-error" role="alert">{ownGroupError} <button type="button" className="btn" disabled={busy} onClick={editOwnGroups}>Reload my groups</button></div>}
      <div className="admin-actions"><button type="button" className="btn" disabled={busy} onClick={() => setOwnGroups(null)}>Cancel</button><button className="btn primary" disabled={busy || !groups.length}>{busy ? 'Saving…' : 'Save my groups'}</button></div>
    </form>}
    <DataTable title="People & access" description="Manage account access and group membership. Changes follow your existing permissions." rows={result.items} emptyTitle="No matching people" emptyDescription="Try another filter, or invite a colleague to your workspace." columns={[
      { id: 'name', label: 'Person', value: (item) => `${item.first_name} ${item.last_name}`, render: (item) => <div className="person-cell"><span className="person-monogram">{item.first_name?.[0]}{item.last_name?.[0]}</span><div><strong>{item.first_name} {item.last_name}</strong><small>{item.department}</small></div></div> },
      { id: 'email', label: 'Email address', value: (item) => item.email },
      { id: 'role', label: 'Role', value: (item) => item.role, render: (item) => <span className="role-label">{item.role === 'org_admin' ? 'Organization admin' : item.role === 'super_admin' ? 'Super Admin' : 'User'}</span> },
      { id: 'groups', label: 'Groups', value: (item) => item.group_ids.length, render: (item) => <span>{item.group_ids.length} assigned</span> },
      { id: 'status', label: 'Account status', value: (item) => item.account_status, render: (item) => <><StatusBadge status={item.account_status} />{item.account_status === 'invited' && item.invitation_delivery_status === 'failed' && <small>Delivery failed</small>}</> },
      { id: 'actions', label: 'Actions', required: true, render: (item) => <div className="table-actions">{item.id === currentUser.id ? <div><small>Current account</small><button className="btn" disabled={busy} onClick={() => editOwnGroups(item)}>Manage my groups</button></div> : <><button className="btn" onClick={() => open(item)}>Edit</button><button className="btn" disabled={busy} onClick={() => toggle(item)}>{item.is_active ? 'Deactivate' : 'Reactivate'}</button>{item.account_status === 'invited' && <button className="btn" disabled={busy} onClick={() => resend(item)}>Resend</button>}</>}</div> },
    ]} />
    <Pagination page={page} pageSize={result.page_size} total={result.total} onPageChange={setPage} noun="users" />
    {editing && <Modal title={editing.id ? 'Edit user' : 'Invite user'} onClose={() => setEditing(null)} dirty><form onSubmit={save} className="admin-stack"><div className="admin-grid two"><label>First name<input autoFocus required minLength="2" value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} /><FieldErrors errors={fieldErrors} field="first_name" /></label><label>Last name<input required minLength="2" value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} /><FieldErrors errors={fieldErrors} field="last_name" /></label></div><label>Email<input type="email" required disabled={Boolean(editing.id && editing.account_status !== 'invited')} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /><FieldErrors errors={fieldErrors} field="email" /></label>{editing.id && editing.account_status !== 'invited' && <p>Verified email changes are not supported here.</p>}<label>Department<input required minLength="2" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /><FieldErrors errors={fieldErrors} field="department" /></label><label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="user">User</option><option value="org_admin">Organization admin</option></select><FieldErrors errors={fieldErrors} field="role" /></label><fieldset><legend>Groups</legend><div className="admin-options">{groups.length ? groups.map((group) => <label key={group._id}><input type="checkbox" checked={form.group_ids.includes(group._id)} onChange={() => setForm({ ...form, group_ids: form.group_ids.includes(group._id) ? form.group_ids.filter((id) => id !== group._id) : [...form.group_ids, group._id] })} /> {group.name}</label>) : 'No groups yet'}</div><FieldErrors errors={fieldErrors} field="group_ids" /></fieldset>
      {error && <div className="admin-error" role="alert">{error}</div>}<div className="admin-actions"><button type="button" className="btn" disabled={busy} onClick={() => setEditing(null)}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : editing.id ? 'Save user' : 'Create invitation'}</button></div></form></Modal>}
  </div>
}
