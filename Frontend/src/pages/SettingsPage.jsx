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

  return <div className="admin-stack">
    {error && <div className="admin-error" role="alert">{error}</div>}{message && <div className="admin-notice" role="status">{message}</div>}
    {settings && <form className="admin-panel admin-stack" onSubmit={save}><h2>Organization</h2><div className="admin-grid two"><label>Name<input required minLength="2" maxLength="160" value={settings.name} onChange={(event) => setSettings({ ...settings, name: event.target.value })} /><FieldErrors errors={fieldErrors} field="name" /></label><label>Slug<input value={settings.slug} disabled /></label></div>
      <label>Content retention days<input type="number" min="1" max="30" value={settings.content_retention_days} onChange={(event) => setSettings({ ...settings, content_retention_days: Number(event.target.value) })} /><FieldErrors errors={fieldErrors} field="content_retention_days" /></label>
      <label><input type="checkbox" checked={settings.require_active_policy} onChange={(event) => setSettings({ ...settings, require_active_policy: event.target.checked })} /> Require an active policy before ordinary prompts</label><FieldErrors errors={fieldErrors} field="require_active_policy" />
      <p className="admin-notice">Retention applies to encrypted prompt and released response text. Shortening it also shortens existing unexpired records; increasing it never restores removed text. Require-policy rejects prompts without an applicable input policy.</p>
      <div className="admin-actions"><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button></div></form>}
    {currentUser?.role === 'super_admin' && <section className="admin-panel"><h2>Platform organizations</h2><p>Metadata only. Prompt content is not accessible here.</p><div className="admin-scroll"><table className="admin-table"><thead><tr><th>Name</th><th>Slug</th><th>Status</th><th>Action</th></tr></thead><tbody>{organizations.map((item) => <tr key={item._id}><td>{item.name}</td><td>{item.slug}</td><td>{item.status || 'active'}</td><td>{item._id !== currentUser.company?.id && <button className="btn" disabled={busy} onClick={() => toggleOrganization(item)}>{item.status === 'suspended' ? 'Reactivate' : 'Suspend'}</button>}</td></tr>)}</tbody></table></div></section>}
    <section className="admin-panel"><h2>Administrative history</h2>{audit.length === 0 ? <p>No administrative events yet.</p> : <div className="admin-scroll"><table className="admin-table"><thead><tr><th>When</th><th>Action</th><th>Resource</th><th>Request ID</th></tr></thead><tbody>{audit.map((item) => <tr key={item._id}><td>{new Date(item.created_at).toLocaleString()}</td><td>{item.action}</td><td>{item.resource_type}</td><td><code>{item.request_id}</code></td></tr>)}</tbody></table></div>}<div className="admin-pagination"><span>{auditTotal} events</span><button className="btn" disabled={auditPage <= 1} onClick={() => setAuditPage(auditPage - 1)}>Previous</button><span>Page {auditPage}</span><button className="btn" disabled={auditPage * 20 >= auditTotal} onClick={() => setAuditPage(auditPage + 1)}>Next</button></div></section>
  </div>
}
