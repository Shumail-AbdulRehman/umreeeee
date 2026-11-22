import { useEffect, useState } from 'react'
import { listGroups } from '../services/groups/groupService'
import { listPolicies } from '../services/policies/policyService'
import { apiRequest } from '../services/api/client'
import PolicyGroupPicker from '../components/PolicyGroupPicker'
import PolicyCheckPicker from '../components/PolicyCheckPicker'
import { policyEntryId, policyEntryName } from '../utils/policyEntries'
import Modal from '../components/Modal'
import LoadingSurface, { InlineLoadingBar } from '../components/LoadingSurface'
import './policies.css'

const label = (kind) => kind === 'dlp' ? 'DLP' : 'Guardrail'
const idsOf = (catalog) => catalog.entries.map(policyEntryId)

function PolicyEditor({ catalog, policy, onClose, onSaved }) {
  const all = idsOf(catalog)
  const existing = policy?.selected_entry_ids || []
  const [name, setName] = useState(policy?.name || '')
  const [description, setDescription] = useState(policy?.description || '')
  const [mode, setMode] = useState(!policy || existing.length === all.length ? 'all' : 'custom')
  const [selected, setSelected] = useState(policy && existing.length !== all.length ? existing : [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const checks = mode === 'all' ? all : selected
  const dirty = policy ? name !== policy.name || description !== (policy.description || '') || checks.length !== existing.length || checks.some((id) => !existing.includes(id)) : Boolean(name || description || selected.length || mode === 'custom')
  function close() { if (!dirty || window.confirm('Discard unsaved changes?')) onClose() }
  async function save(event) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const body = { name: name.trim(), description: description.trim(), selected_entry_ids: checks }
      const response = await apiRequest(policy ? `/policy-sets/${policy._id}` : '/policy-sets', {
        method: policy ? 'PUT' : 'POST', body: JSON.stringify(policy ? { ...body, version: policy.version } : { ...body, category: catalog.category }),
      })
      onSaved(response.policy, policy ? 'Policy updated.' : 'Policy created. Assign it to groups when ready.')
    } catch (problem) { setError(problem.message) }
    finally { setBusy(false) }
  }
  return <Modal className="policy-page" title={policy ? `Edit ${policy.name}` : `Create ${label(catalog.category)} policy`} wide dirty={dirty && !busy} onClose={onClose}>
    <form onSubmit={save}>
      <div className="assignment-editor-body policy-set-editor">
        <p className="policy-editor-intro">Create the policy first. Group assignments are managed separately and can be changed later.</p>
        <div className="policy-set-fields"><label>Policy name<input autoFocus required minLength="2" maxLength="120" value={name} onChange={(event) => setName(event.target.value)} placeholder={catalog.category === 'dlp' ? 'Customer data protection' : 'Safe responses'} /></label>
          <label>Description <span className="policy-muted">Optional</span><textarea maxLength="2000" rows="2" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What does this policy protect?" /></label></div>
        <fieldset className="assignment-modes"><legend>Checks in this policy</legend>
          <label className={mode === 'all' ? 'is-selected' : ''}><input type="radio" name="policy-check-mode" checked={mode === 'all'} onChange={() => setMode('all')} />
            <span><strong>All {all.length} checks</strong><small>Include every check currently in this catalog.</small></span></label>
          <label className={mode === 'custom' ? 'is-selected' : ''}><input type="radio" name="policy-check-mode" checked={mode === 'custom'} onChange={() => setMode('custom')} />
            <span><strong>Choose specific checks</strong><small>Select only the checks this policy needs.</small></span></label></fieldset>
        {mode === 'custom' ? <PolicyCheckPicker entries={catalog.entries} selected={selected} onChange={setSelected} disabled={busy} /> :
          <div className="assignment-all-summary"><strong>All {all.length} current checks selected</strong><p>{catalog.entries.slice(0, 3).map(policyEntryName).join(' · ')}{all.length > 3 ? ` · and ${all.length - 3} more` : ''}</p></div>}
        {busy && <InlineLoadingBar label="Saving policy…" />}
        {error && <p className="admin-error" role="alert">{error}</p>}
      </div>
      <div className="assignment-editor-footer"><span>{checks.length} of {all.length} checks · No groups changed</span><div className="assignment-footer-actions">
        <button type="button" className="btn" disabled={busy} onClick={close}>Cancel</button>
        <button className="btn primary" disabled={busy || !name.trim() || !checks.length}>{busy ? 'Saving…' : policy ? 'Save policy' : 'Create policy'}</button></div></div>
    </form>
  </Modal>
}

function GroupEditor({ policy, groups, onClose, onSaved }) {
  const [selected, setSelected] = useState(policy.scope.group_ids)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dirty = selected.length !== policy.scope.group_ids.length || selected.some((id) => !policy.scope.group_ids.includes(id))
  function close() { if (!dirty || window.confirm('Discard unsaved changes?')) onClose() }
  async function save() {
    setBusy(true); setError('')
    try {
      const result = await apiRequest(`/policy-sets/${policy._id}/groups`, {
        method: 'PUT', body: JSON.stringify({ version: policy.version, group_ids: selected }),
      })
      onSaved(result.policy, 'Group assignments saved.')
    } catch (problem) { setError(problem.message) }
    finally { setBusy(false) }
  }
  return <Modal className="policy-page" title={`Assign ${policy.name} to groups`} wide dirty={dirty && !busy} onClose={onClose}>
    <div className="assignment-editor-body"><p className="policy-editor-intro">Every selected group receives the same {policy.selected_entry_ids.length} checks. You can reuse this policy across groups without creating a copy.</p>
      <PolicyGroupPicker groups={groups} selected={selected} onChange={setSelected} disabled={busy} />
      {busy && <InlineLoadingBar label="Saving group assignments…" />}
      {error && <p role="alert" className="admin-error">{error}</p>}</div>
    <div className="assignment-editor-footer"><span>{selected.length} groups selected</span><div className="assignment-footer-actions">
      <button type="button" className="btn" disabled={busy} onClick={close}>Cancel</button>
      <button type="button" className="btn primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save assignments'}</button></div></div>
  </Modal>
}

function PolicyWorkspace({ catalog, policies, groups, onSaved, onCatalogSaved, filterGroupId }) {
  const [editor, setEditor] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState('')
  const [browse, setBrowse] = useState(false)
  const kind = label(catalog.category)
  const active = policies.filter((policy) => policy.status !== 'archived')
  const visible = active.filter((policy) => `${policy.name} ${policy.description || ''}`.toLowerCase().includes(search.trim().toLowerCase()))
  const assignedPolicies = active.filter((policy) => policy.status === 'active' && policy.scope.group_ids.length)
  const coveredGroups = new Set(assignedPolicies.flatMap((policy) => policy.scope.group_ids)).size
  const selectedGroup = groups.find((group) => group._id === filterGroupId)
  const oldGroupIds = catalog.scope?.group_ids || []
  function saved(policy, text) { onSaved(policy); setEditor(null); setMessage(text); setError('') }
  async function clearOldAssignments() {
    if (!window.confirm(`Remove the earlier direct ${kind} assignments from ${oldGroupIds.length} groups? Create and assign replacement policies first if these checks are still needed.`)) return
    setBusy('legacy'); setError('')
    try {
      const result = await apiRequest(`/policies/${catalog._id}/group-selections`, {
        method: 'PUT', body: JSON.stringify({ version: catalog.version, group_ids: oldGroupIds, selected_entry_ids: [] }),
      })
      onCatalogSaved(result.policy); setMessage('Earlier direct assignments removed.')
    } catch (problem) { setError(problem.message) }
    finally { setBusy('') }
  }
  async function status(policy, next) {
    if (next === 'archived' && !window.confirm(`Archive ${policy.name}? Its group assignments will be removed.`)) return
    setBusy(policy._id); setError('')
    try {
      const result = await apiRequest(`/policy-sets/${policy._id}/status`, {
        method: 'PATCH', body: JSON.stringify({ version: policy.version, status: next }),
      })
      onSaved(result.policy); setMessage(`${policy.name} ${next === 'archived' ? 'archived' : next}.`)
    } catch (problem) { setError(problem.message) }
    finally { setBusy('') }
  }
  return <div className={`policy-overview policy-${catalog.category}`}>
    <header className="policy-intro"><div className="policy-intro-copy"><div className="policy-symbol" aria-hidden="true">{catalog.category === 'dlp' ? '◈' : '◇'}</div>
      <div><span className="policy-eyebrow">{kind.toUpperCase()} / POLICY LIBRARY</span><h2>{kind} policies</h2>
        <p>{catalog.category === 'dlp' ? 'Protect sensitive data in prompts and responses.' : 'Set the safety boundaries for your teams’ AI conversations.'} Build a policy once, then assign it wherever it belongs.</p></div></div>
      <button type="button" className="btn primary" onClick={() => setEditor({ type: 'policy', policy: null })}><span aria-hidden="true">＋</span> Create {kind} policy</button></header>
    <div className="policy-summary-line" aria-label="Policy library summary"><div><span>Created policies</span><strong>{active.length}</strong><small>Reusable definitions</small></div><div><span>In use</span><strong>{assignedPolicies.length}</strong><small>Active and assigned</small></div><div><span>Covered groups</span><strong>{coveredGroups}</strong><small>Across this library</small></div><div><span>Available checks</span><strong>{catalog.entry_count}</strong><small>In the {kind} catalog</small></div></div>
    {selectedGroup && <p className="policy-service-notice">Viewing from {selectedGroup.name}. Create a policy or use “Assign groups” below to include this group.</p>}
    {message && <p role="status" className="policy-success">{message}</p>}
    {busy && <InlineLoadingBar label="Updating policy status…" />}
    {error && <p role="alert" className="admin-error">{error}</p>}
    {oldGroupIds.length > 0 && <section className="policy-legacy-note"><div><strong>{oldGroupIds.length} earlier direct group assignment{oldGroupIds.length === 1 ? '' : 's'} still active</strong>
      <p>These catalog assignments continue to apply alongside created policies. Create replacements and attach them to groups before clearing the earlier assignments.</p></div>
      <button type="button" className="btn" disabled={busy === 'legacy'} onClick={clearOldAssignments}>{busy === 'legacy' ? 'Removing…' : 'Remove earlier assignments'}</button></section>}
    <section className="policy-surface"><div className="policy-section-header"><div><span className="policy-eyebrow">YOUR LIBRARY</span><h2>Created policies</h2><p>Policy definitions and group assignments stay separate, so you can reuse a policy across teams.</p></div><span className="policy-number">{visible.length} shown</span></div>
      <div className="policy-table-tools"><input type="search" aria-label="Search policies" placeholder="Search policies by name or description…" value={search} onChange={(event) => setSearch(event.target.value)} /><button type="button" className="policy-text-button" onClick={() => setBrowse(true)}>Browse all {catalog.entry_count} checks <span aria-hidden="true">↗</span></button></div>
      <div className="policy-set-list">{visible.map((policy) => {
        const names = groups.filter((group) => policy.scope.group_ids.includes(group._id)).map((group) => group.name)
        return <article className="policy-set-row" key={policy._id}>
          <div className="policy-set-main"><div className="policy-set-title"><span className="policy-set-icon" aria-hidden="true">{catalog.category === 'dlp' ? '◈' : '◇'}</span><h3>{policy.name}</h3><span className={`policy-assignment-status ${policy.status === 'active' && names.length ? 'is-assigned' : ''}`}>{policy.status === 'active' && !names.length ? 'Not assigned' : policy.status}</span></div>
            <p>{policy.description || 'No description added.'}</p><div className="policy-set-meta"><span><strong>{policy.selected_entry_ids.length}</strong> of {catalog.entry_count} checks</span><span><strong>{names.length}</strong> groups{names.length ? ` · ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''}` : ''}</span></div><div className="policy-set-meter" aria-label={`${policy.selected_entry_ids.length} of ${catalog.entry_count} checks selected`}><span style={{ width: `${catalog.entry_count ? policy.selected_entry_ids.length / catalog.entry_count * 100 : 0}%` }} /></div></div>
          <div className="policy-set-actions"><button type="button" className="btn" onClick={() => setEditor({ type: 'policy', policy })}>Edit checks</button>
            <button type="button" className="btn primary" onClick={() => setEditor({ type: 'groups', policy })}>Assign groups</button>
            <button type="button" className="policy-text-button" disabled={busy === policy._id} onClick={() => status(policy, policy.status === 'active' ? 'disabled' : 'active')}>{policy.status === 'active' ? 'Disable' : 'Enable'}</button>
            <button type="button" className="policy-remove" disabled={busy === policy._id} onClick={() => status(policy, 'archived')}>Archive</button></div>
        </article>
      })}</div>
      {!visible.length && <div className="policy-empty"><strong>{active.length ? 'No matching policies' : `No ${kind} policies yet`}</strong><p>{active.length ? 'Try another search.' : 'Create a named policy by choosing all checks or a custom selection. You can assign it to groups afterward.'}</p>
        <button type="button" className="btn primary" onClick={() => active.length ? setSearch('') : setEditor({ type: 'policy', policy: null })}>{active.length ? 'Clear search' : `Create ${kind} policy`}</button></div>}
    </section>
    <p className="policy-footnote">New policies start with no group assignments. Each policy's checks apply to every group assigned to it.</p>
    {editor?.type === 'policy' && <PolicyEditor key={editor.policy?._id || 'new'} catalog={catalog} policy={editor.policy} onClose={() => setEditor(null)} onSaved={saved} />}
    {editor?.type === 'groups' && <GroupEditor key={editor.policy._id} policy={editor.policy} groups={groups} onClose={() => setEditor(null)} onSaved={saved} />}
    {browse && <Modal className="policy-page" title={`${kind} check catalog`} wide onClose={() => setBrowse(false)}><div className="assignment-editor-body"><PolicyCheckPicker entries={catalog.entries} selected={[]} readOnly /></div>
      <div className="assignment-editor-footer"><span>{catalog.entry_count} available checks</span><button className="btn" type="button" onClick={() => setBrowse(false)}>Done</button></div></Modal>}
  </div>
}

export function DlpPolicyPage(props) { return <PoliciesPage {...props} policyKind="dlp" /> }
export function GuardrailPolicyPage(props) { return <PoliciesPage {...props} policyKind="guardrail" /> }

export default function PoliciesPage({ filterGroupId = '', policyKind = '' }) {
  const [catalogs, setCatalogs] = useState([])
  const [policies, setPolicies] = useState([])
  const [groups, setGroups] = useState([])
  const [active, setActive] = useState('dlp')
  const [loading, setLoading] = useState(true)
  const [loadStage, setLoadStage] = useState('Loading policy catalogs…')
  const [loadKey, setLoadKey] = useState(0)
  const [error, setError] = useState('')
  const kind = policyKind || active
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(''); setLoadStage('Loading policy catalogs…')
      try {
        async function allPolicySets(category) {
          const items = []
          for (let page = 1; !cancelled; page += 1) {
            const result = await apiRequest(`/policy-sets?category=${category}&page_size=100&page=${page}`)
            items.push(...result.items)
            if (items.length >= result.total || !result.items.length) break
          }
          return items
        }
        const [catalogResult, dlp, guardrail] = await Promise.all([listPolicies('?page_size=100'),
          allPolicySets('dlp'), allPolicySets('guardrail')])
        if (!cancelled) setLoadStage('Loading groups and assignments…')
        const allGroups = []
        let page = 1
        while (!cancelled) {
          const result = await listGroups(`?page_size=100&status=active&page=${page}`)
          allGroups.push(...result.items)
          if (allGroups.length >= result.total || !result.items.length) break
          page += 1
        }
        if (!cancelled) { setCatalogs(catalogResult.items); setPolicies([...dlp, ...guardrail]); setGroups(allGroups) }
      } catch (problem) { if (!cancelled) setError(problem.message) }
      finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [loadKey])
  function saved(policy) { setPolicies((current) => [policy, ...current.filter((item) => item._id !== policy._id)]) }
  function savedCatalog(catalog) { setCatalogs((current) => current.map((item) => item._id === catalog._id ? catalog : item)) }
  return <section className="admin-stack policy-page">
    {loading && <LoadingSurface kind={policyKind ? `${policyKind}-policy` : 'policies'} label={loadStage} />}
    {error && <div className="policy-load-error"><p role="alert" className="admin-error">{error}</p><button type="button" className="btn" onClick={() => setLoadKey((value) => value + 1)}>Try again</button></div>}
    {!policyKind && !loading && <div className="policy-switch" aria-label="Policy type">{['dlp', 'guardrail'].map((item) => <button type="button" key={item} aria-pressed={kind === item} onClick={() => setActive(item)}>{label(item)} policies</button>)}</div>}
    {!loading && !error && !catalogs.some((item) => item.category === kind) && <div className="policy-surface policy-empty"><strong>No {label(kind)} catalog available</strong><p>Import the {label(kind)} check catalog before creating a policy.</p></div>}
    {!loading && !error && catalogs.filter((item) => item.category === kind).map((catalog) => <PolicyWorkspace key={catalog._id} catalog={catalog} policies={policies.filter((policy) => policy.category === kind)} groups={groups} filterGroupId={filterGroupId} onSaved={saved} onCatalogSaved={savedCatalog} />)}
  </section>
}
