import { Building2, Clock3, ShieldCheck } from 'lucide-react'
import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import { Pagination, SectionHeader } from '../components/Surface'
import { formatDate } from '../lib/format'
import { useEffect, useState } from 'react'
import { getAudit, getSettings, listOrganizations, setOrganizationStatus, updateSettings } from '../services/settings/settingsService'
import FieldErrors from '../components/FieldErrors'

export default function SettingsPage({ currentUser }) {
  const [settings, setSettings] = useState(null)
  const [audit, setAudit] = useState([])
  const [auditPage, setAuditPage] = useState(1)
  const [auditTotal, setAuditTotal] = useState(0)
  const [organizations, setOrganizations] = useState([])
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function refresh() {
    try {
      const [settingsResult, auditResult] = await Promise.all([getSettings(), getAudit(auditPage)])
      setSettings(settingsResult.settings)
      setAudit(auditResult.items)
      setAuditTotal(auditResult.total)
      if (currentUser?.role === 'super_admin') setOrganizations((await listOrganizations()).items)
      setError('')
    } catch (problem) { setError(problem.message) }
  }
  useEffect(() => { void Promise.resolve().then(refresh) }, [currentUser?.role, auditPage]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    try { const result = await updateSettings({ version: settings.version, name: settings.name,
      content_retention_days: settings.content_retention_days,
      require_active_policy: settings.require_active_policy }); setSettings(result.settings); setFieldErrors({}); setMessage(result.message); await refresh() }
    catch (problem) { setError(problem.message); setFieldErrors(problem.fieldErrors || {}) }
    finally { setBusy(false) }
  }
  async function toggleOrganization(item) {
    const next = item.status === 'suspended' ? 'active' : 'suspended'
    if (!window.confirm(`${next === 'suspended' ? 'Suspend' : 'Reactivate'} ${item.name}? This changes access for its users.`)) return
    setBusy(true)
    try { await setOrganizationStatus(item._id, { status: next, version: item.version }); await refresh() }
    catch (problem) { setError(problem.message) }
    finally { setBusy(false) }
  }

  return <div className="admin-stack settings-page">
    {error && <div className="admin-error" role="alert">{error}</div>}{message && <div className="admin-notice" role="status">{message}</div>}
    {settings && <div className="settings-layout"><aside className="settings-context"><span className="settings-context-icon"><Building2 size={23} /></span><h2>Workspace preferences</h2><p>Manage your organization identity, retained content, and policy requirements.</p><div><Clock3 size={16} /><span>Retention limits stored text.<br />Audit metadata remains available.</span></div><div><ShieldCheck size={16} /><span>Policy assignments determine which checks apply to a prompt.</span></div></aside><form className="admin-panel admin-stack" onSubmit={save}><SectionHeader title="Organization identity" description="The name people see throughout your workspace." /><div className="admin-grid two"><label>Name<input required minLength="2" maxLength="160" value={settings.name} onChange={(event) => setSettings({ ...settings, name: event.target.value })} /><FieldErrors errors={fieldErrors} field="name" /></label><label>Slug<input value={settings.slug} disabled /></label></div><div className="settings-divider" /><SectionHeader title="Content & policy controls" description="Control retained text and whether ordinary prompts need an active policy." /><label>Content retention days<input type="number" min="1" max="30" value={settings.content_retention_days} onChange={(event) => setSettings({ ...settings, content_retention_days: Number(event.target.value) })} /><FieldErrors errors={fieldErrors} field="content_retention_days" /></label><label className="settings-checkbox"><input type="checkbox" checked={settings.require_active_policy} onChange={(event) => setSettings({ ...settings, require_active_policy: event.target.checked })} /><span><strong>Require an active policy before ordinary prompts</strong><small>Prompts without an applicable input policy are rejected.</small></span></label><FieldErrors errors={fieldErrors} field="require_active_policy" /><p className="admin-notice">Retention applies to encrypted prompt and released response text. Shortening it also shortens existing unexpired records; increasing it never restores removed text. Require-policy rejects prompts without an applicable input policy.</p><div className="admin-actions"><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button></div></form></div>}
    {currentUser?.role === 'super_admin' && <DataTable title="Platform organizations" description="Metadata only. Prompt content is not accessible here." rows={organizations} rowKey="_id" emptyTitle="No organizations" emptyDescription="Organizations will appear here after registration." columns={[
      { id:'name',label:'Organization',value:(item)=>item.name,render:(item)=><strong>{item.name}</strong> },
      { id:'slug',label:'Slug',value:(item)=>item.slug },
      { id:'status',label:'Status',value:(item)=>item.status || 'active',render:(item)=><StatusBadge status={item.status || 'active'} /> },
      { id:'action',label:'Action',required:true,render:(item)=>item._id !== currentUser.company?.id ? <button className="btn" disabled={busy} onClick={() => toggleOrganization(item)}>{item.status === 'suspended' ? 'Reactivate' : 'Suspend'}</button> : <small>Current organization</small> },
    ]} />}
    <DataTable title="Administrative history" description="Recorded organization changes and their request identifiers." rows={audit} rowKey="_id" emptyTitle="No administrative events yet" emptyDescription="Changes to users, groups, policies and settings leave an audit record here." columns={[
      { id:'when',label:'Recorded',value:(item)=>item.created_at,render:(item)=>formatDate(item.created_at) },
      { id:'action',label:'Action',value:(item)=>item.action,render:(item)=><strong>{item.action}</strong> },
      { id:'resource',label:'Resource',value:(item)=>item.resource_type,render:(item)=><>{item.resource_type}<small>{item.resource_id}</small></> },
      { id:'request',label:'Request ID',value:(item)=>item.request_id,render:(item)=><span className="audit-id">{item.request_id}</span> },
    ]} />
    <Pagination page={auditPage} total={auditTotal} onPageChange={setAuditPage} noun="events" />
  </div>
}
