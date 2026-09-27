import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '../services/api/client'
import { listGroups } from '../services/groups/groupService'
import { getPolicyCapabilities, listPolicies } from '../services/policies/policyService'
import PolicyGroupPicker from '../components/PolicyGroupPicker'
import PolicyCheckPicker from '../components/PolicyCheckPicker'
import { policyEntryId, policyEntryName } from '../utils/policyEntries'
import Modal from '../components/Modal'
import './policies.css'

const same = (a, b) => a.length === b.length && a.every((value) => b.includes(value))
const checksFor = (policy, groupId) => {
  if (!policy.scope.group_ids.includes(groupId)) return []
  return policy.group_entry_selections?.find((item) => item.group_id === groupId)?.selected_entry_ids
    ?? policy.selected_entry_ids ?? policy.entries.map(policyEntryId)
}

function PolicyIcon({ kind }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'dlp' ? <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3" /></>
      : <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>}
  </svg>
}

function useUnsavedChanges(dirty) {
  useEffect(() => {
    if (!dirty) return
    const warn = (event) => { event.preventDefault(); event.returnValue = '' }
    const confirmNavigation = (event) => {
      if (!window.confirm('Discard unsaved policy changes and leave this page?')) event.preventDefault()
    }
    const confirmLink = (event) => {
      const link = event.target.closest('a[href^="#"]')
      if (link && link.hash !== window.location.hash) confirmNavigation(event)
    }
    window.addEventListener('beforeunload', warn)
    window.addEventListener('sentinel:before-navigation', confirmNavigation)
    document.addEventListener('click', confirmLink, true)
    return () => {
      window.removeEventListener('beforeunload', warn)
      window.removeEventListener('sentinel:before-navigation', confirmNavigation)
      document.removeEventListener('click', confirmLink, true)
    }
  }, [dirty])
}

function AssignmentEditor({ policy, groups, group, onClose, onSaved }) {
  const title = policy.category === 'dlp' ? 'DLP' : 'Guardrail'
  const allIds = policy.entries.map(policyEntryId)
  const initialGroups = group ? [group._id] : []
  const initialChecks = group ? checksFor(policy, group._id) : []
  const [targets, setTargets] = useState(initialGroups)
  const [step, setStep] = useState(group ? 'checks' : 'groups')
  const [mode, setMode] = useState(initialChecks.length && initialChecks.length !== allIds.length ? 'custom' : 'all')
  const [custom, setCustom] = useState(initialChecks.length === allIds.length ? [] : initialChecks)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const stepHeading = useRef(null)
  const selected = mode === 'all' ? allIds : custom
  const dirty = !same(targets, initialGroups) || !same(selected, initialChecks)
  const targetNames = groups.filter((item) => targets.includes(item._id)).map((item) => item.name)
  useUnsavedChanges(dirty)

  function close() {
    if (!busy && (!dirty || window.confirm('Discard unsaved changes?'))) onClose()
  }
  function changeStep(value) {
    setStep(value)
    requestAnimationFrame(() => stepHeading.current?.focus())
  }
  async function save() {
    setBusy(true); setError('')
    try {
      const result = await apiRequest(`/policies/${policy._id}/group-selections`, {
        method: 'PUT', body: JSON.stringify({ version: policy.version, group_ids: targets, selected_entry_ids: selected }),
      })
      onSaved(result.policy, `${selected.length} ${title} checks saved for ${targets.length === 1 ? targetNames[0] : `${targets.length} groups`}.`)
    } catch (problem) { setError(problem.status === 409 ? `${problem.message} Close this editor and reload the page before trying again. Your selection is still here.` : problem.message) }
    finally { setBusy(false) }
  }

  return <Modal title={group ? `${title} checks for ${group.name}` : `Assign ${title} checks`} wide dirty={dirty && !busy} onClose={() => { if (!busy) onClose() }}>
    <div className="assignment-editor-body">
      {!group && <ol className="assignment-steps" aria-label="Assignment steps">
        <li aria-current={step === 'groups' ? 'step' : undefined}><span>1</span>Choose groups</li>
        <li aria-current={step === 'checks' ? 'step' : undefined}><span>2</span>Choose checks</li>
      </ol>}
      <h3 className="policy-sr-only" ref={stepHeading} tabIndex={-1}>{step === 'groups' ? 'Choose user groups' : 'Choose policy checks'}</h3>
      {step === 'groups' ? <>
        <p className="policy-editor-intro">Select the groups that should receive the same checks. You can customize each group later.</p>
        <PolicyGroupPicker groups={groups} selected={targets} onChange={setTargets} disabled={busy} />
      </> : <>
        <div className="assignment-targets"><span>APPLY TO</span><strong>{targetNames.slice(0, 3).join(', ')}{targetNames.length > 3 ? ` +${targetNames.length - 3} more` : ''}</strong>
          {!group && <button className="policy-text-button" type="button" disabled={busy} onClick={() => changeStep('groups')}>Change groups</button>}
        </div>
        <fieldset className="assignment-modes" disabled={busy}>
          <legend>How many checks should apply?</legend>
          <label className={mode === 'all' ? 'is-selected' : ''}>
            <input type="radio" name="check-mode" value="all" checked={mode === 'all'} onChange={() => setMode('all')} />
            <span><strong>All {allIds.length} checks</strong><small>Apply every check in this catalog.</small></span>
          </label>
          <label className={mode === 'custom' ? 'is-selected' : ''}>
            <input type="radio" name="check-mode" value="custom" checked={mode === 'custom'} onChange={() => setMode('custom')} />
            <span><strong>Choose specific checks</strong><small>Select only the checks this group needs.</small></span>
          </label>
        </fieldset>
        {mode === 'custom' ? <PolicyCheckPicker entries={policy.entries} selected={custom} onChange={setCustom} disabled={busy} />
          : <div className="assignment-all-summary"><span className="assignment-all-icon" aria-hidden="true">✓</span><div><h3>Every current {title} check is included</h3>
            <p>All {allIds.length} checks will apply to {targets.length === 1 ? 'this group' : `these ${targets.length} groups`} after you save.</p>
            <ul>{policy.entries.slice(0, 4).map((entry) => <li key={policyEntryId(entry)}>{policyEntryName(entry)}</li>)}</ul>
            {allIds.length > 4 && <small>and {allIds.length - 4} more checks</small>}
            <p className="policy-footnote">New checks added to the catalog later need to be selected separately.</p>
          </div></div>}
        <p className="assignment-scope-note">Only {targets.length === 1 ? 'this group’s' : 'the selected groups’'} {title} assignment changes. Other groups and {title === 'DLP' ? 'Guardrail' : 'DLP'} selections stay as saved.</p>
      </>}
      {error && <p role="alert" className="admin-error">{error}</p>}
    </div>
    <div className="assignment-editor-footer">
      <div role="status" aria-live="polite"><strong>{step === 'groups' ? `${targets.length} groups selected` : `${selected.length} of ${allIds.length} checks selected`}</strong>
        <span>{step === 'checks' && !selected.length ? 'Select at least one check to continue.' : 'Changes apply after saving.'}</span></div>
      <div className="assignment-footer-actions"><button type="button" className="btn" disabled={busy} onClick={close}>Cancel</button>
        {step === 'groups' ? <button type="button" className="btn primary" disabled={!targets.length || busy} onClick={() => changeStep('checks')}>Choose checks <span aria-hidden="true">→</span></button>
          : <button type="button" className="btn primary" disabled={busy || !selected.length || !targets.length || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save assignment'}</button>}
      </div>
    </div>
  </Modal>
}

function PolicyOverview({ policy, groups, onSaved, filterGroupId, remoteEnabled }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null)
  const [browse, setBrowse] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState('')
  const title = policy.category === 'dlp' ? 'DLP' : 'Guardrail'
  const total = policy.entries.length
  const assigned = new Set(policy.scope.group_ids)
  const matching = groups.filter((group) => {
    const checks = checksFor(policy, group._id)
    return (!filterGroupId || group._id === filterGroupId) &&
      `${group.name} ${group.description || ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
      (filter === 'all' || (filter === 'assigned' && assigned.has(group._id)) ||
        (filter === 'unassigned' && !assigned.has(group._id)) ||
        (filter === 'custom' && checks.length > 0 && checks.length < total))
  }).sort((a, b) => a.name.localeCompare(b.name) || a._id.localeCompare(b._id))
  const pages = Math.max(1, Math.ceil(matching.length / 8))
  const currentPage = Math.min(page, pages)
  const customGroups = policy.scope.group_ids.filter((id) => checksFor(policy, id).length < total).length
  useEffect(() => {
    if (!editing && !browse) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [editing, browse])

  function saved(updated, text) { onSaved(updated); setEditing(null); setMessage(text); setError('') }
  async function remove(group) {
    if (!window.confirm(`Remove ${title} checks from ${group.name}? Other groups and policy types will keep their assignments.`)) return
    setRemoving(group._id); setError(''); setMessage('')
    try {
      const result = await apiRequest(`/policies/${policy._id}/group-selections`, {
        method: 'PUT', body: JSON.stringify({ version: policy.version, group_ids: [group._id], selected_entry_ids: [] }),
      })
      saved(result.policy, `${title} assignment removed from ${group.name}.`)
    } catch (problem) { setError(problem.message) }
    finally { setRemoving('') }
  }

  return <div className={`policy-overview policy-${policy.category}`}>
    <section className="policy-intro">
      <div className="policy-intro-copy"><span className="policy-symbol"><PolicyIcon kind={policy.category} /></span><div>
        <span className="policy-eyebrow">{policy.category === 'dlp' ? 'DATA LOSS PREVENTION' : 'AI SAFETY & BEHAVIOR'}</span>
        <h2>{policy.category === 'dlp' ? 'The right protection for each team.' : 'Set the boundaries for each team.'}</h2>
        <p>Apply all {total} checks, or choose a specific set for each user group.</p>
      </div></div>
      <button type="button" className="btn primary" disabled={!groups.length || Boolean(removing)} onClick={() => { setMessage(''); setEditing({ group: groups.find((group) => group._id === filterGroupId) }) }}>Assign to groups <span aria-hidden="true">＋</span></button>
    </section>
    <div className="policy-summary-line"><span><strong>{total}</strong> available checks</span><span><strong>{assigned.size}</strong> groups assigned</span><span><strong>{customGroups}</strong> custom selections</span>
      <button type="button" className="policy-text-button" onClick={() => setBrowse(true)}>Browse catalog <span aria-hidden="true">↗</span></button>
    </div>
    {!remoteEnabled && <div className="policy-service-notice"><strong>Security checking is not configured.</strong> You can save assignments. Assigned prompts will be withheld until checking is available.</div>}
    {message && <p className="policy-success" role="status">✓ {message}</p>}
    {error && <p className="admin-error" role="alert">{error}</p>}
    <section className="policy-surface" aria-label="Group assignments">
      <div className="policy-section-header"><div><h2>Group assignments</h2><p>Each group has its own set of {title} checks.</p></div><span className="policy-number">{groups.length} user groups</span></div>
      {filterGroupId && <div className="policy-scope-note">Showing the group selected in Groups. <a href={`#${policy.category === 'dlp' ? 'dlp-policy' : 'guardrail-policy'}`}>View all groups</a></div>}
      <div className="policy-table-tools"><label><span className="policy-sr-only">Search user groups</span><input type="search" placeholder="Search groups by name or description…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></label>
        <label><span className="policy-sr-only">Assignment status</span><select aria-label="Assignment status" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1) }}>
          <option value="all">All groups</option><option value="assigned">Assigned</option><option value="custom">Custom selections</option><option value="unassigned">Not assigned</option></select></label></div>
      <div className="policy-group-table" role="table" aria-label={`${title} group assignments`}>
        <div className="policy-table-head" role="row"><span role="columnheader">User group</span><span role="columnheader">Selected checks</span><span role="columnheader">Assignment</span><span role="columnheader">Actions</span></div>
        {matching.slice((currentPage - 1) * 8, currentPage * 8).map((group) => {
          const checks = checksFor(policy, group._id)
          const isAssigned = assigned.has(group._id)
          const all = isAssigned && checks.length === total
          return <div className="policy-table-row" role="row" key={group._id}>
            <div className="policy-table-name" role="cell"><span className="policy-group-avatar" aria-hidden="true">{group.name.slice(0, 2).toUpperCase()}</span><div><strong>{group.name}</strong><p>{group.member_count ?? 0} members{group.description ? ` · ${group.description}` : ''}</p></div></div>
            <div className="policy-check-count" role="cell"><strong>{isAssigned ? checks.length : '—'}</strong><span>{isAssigned ? ` / ${total} checks` : ' No checks selected'}</span>
              {isAssigned && <span className="policy-count-track" aria-hidden="true"><span style={{ width: `${checks.length / total * 100}%` }} /></span>}
            </div>
            <span role="cell"><span className={`policy-assignment-status ${isAssigned ? 'is-assigned' : ''}`}>{all ? 'All checks' : isAssigned ? 'Custom selection' : 'Not assigned'}</span></span>
            <div className="policy-row-actions" role="cell"><button type="button" className="btn" disabled={Boolean(removing)} aria-label={`Configure ${title} checks for ${group.name}`} onClick={() => setEditing({ group })}>{isAssigned ? 'Edit checks' : 'Assign checks'}</button>
              {isAssigned && <button type="button" className="policy-remove" disabled={Boolean(removing)} aria-label={`Remove ${title} assignment from ${group.name}`} onClick={() => remove(group)}>{removing === group._id ? 'Removing…' : 'Remove'}</button>}
            </div>
          </div>
        })}
      </div>
      {!matching.length && <div className="policy-empty"><strong>{groups.length ? 'No matching groups' : 'Start with a user group'}</strong><p>{groups.length ? 'Try another search or assignment filter.' : `Create a group, then choose the ${title} checks its members need.`}</p>
        {groups.length ? <button type="button" className="btn" onClick={() => { setSearch(''); setFilter('all'); setPage(1) }}>Reset filters</button> : <a className="btn" href="#inventory">Create a group</a>}</div>}
      <div className="policy-pagination"><span>{matching.length ? `${(currentPage - 1) * 8 + 1}–${Math.min(currentPage * 8, matching.length)}` : '0'} of {matching.length} groups</span><div>
        <button type="button" className="btn" aria-label="Previous assignments page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage} / {pages}</span>
        <button type="button" className="btn" aria-label="Next assignments page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>
    </section>
    <p className="policy-footnote">Checks apply to prompts and AI responses. Members of several groups receive the combined checks from those groups.</p>
    {editing && <AssignmentEditor policy={policy} groups={groups} group={editing.group} onClose={() => setEditing(null)} onSaved={saved} />}
    {browse && <Modal title={`${title} check catalog`} wide onClose={() => setBrowse(false)}><div className="assignment-editor-body"><p className="policy-editor-intro">Explore the available checks. To apply them, configure a group’s assignment.</p>
      <PolicyCheckPicker entries={policy.entries} selected={[]} readOnly /></div><div className="assignment-editor-footer"><span>{total} available checks</span><button className="btn" type="button" onClick={() => setBrowse(false)}>Done</button></div></Modal>}
  </div>
}

export function DlpPolicyPage(props) { return <PoliciesPage {...props} policyKind="dlp" /> }
export function GuardrailPolicyPage(props) { return <PoliciesPage {...props} policyKind="guardrail" /> }

export default function PoliciesPage({ filterGroupId = '', policyKind = '' }) {
  const [remoteEnabled, setRemoteEnabled] = useState(false)
  const [policies, setPolicies] = useState([])
  const [groups, setGroups] = useState([])
  const [active, setActive] = useState('dlp')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [result, capabilities] = await Promise.all([listPolicies('?page_size=100'), getPolicyCapabilities()])
        const allGroups = []
        let page = 1
        while (!cancelled) {
          const batch = await listGroups(`?page_size=100&status=active&page=${page}`)
          allGroups.push(...batch.items)
          if (allGroups.length >= batch.total || !batch.items.length) break
          page += 1
        }
        if (!cancelled) { setPolicies(result.items); setGroups(allGroups); setRemoteEnabled(capabilities.remote_detection_enabled && capabilities.enforcement_ready) }
      } catch (problem) { if (!cancelled) setError(problem.message) }
      finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [])
  return <section className="admin-stack policy-page">
    {error && <p role="alert" className="admin-error">{error}</p>}
    {loading && <p role="status">Loading policy configuration…</p>}
    {!loading && !policies.length && !error && <div className="policy-surface policy-empty"><strong>No policy catalogs available</strong><p>Import the DLP and Guardrail catalogs to start configuring group checks.</p></div>}
    {!policyKind && policies.length > 0 && <div className="policy-switch" aria-label="Policy type">{['dlp', 'guardrail'].map((kind) => <button type="button" key={kind} aria-pressed={active === kind} onClick={() => setActive(kind)}>{kind === 'dlp' ? 'DLP policy' : 'Guardrail policy'}</button>)}</div>}
    {!loading && !error && policies.length > 0 && !policies.some((policy) => policy.category === (policyKind || active)) && <p className="admin-notice">This policy catalog has not been imported yet.</p>}
    {!loading && !error && policies.filter((policy) => policy.category === (policyKind || active)).map((policy) => <PolicyOverview key={policy._id} policy={policy} groups={groups} filterGroupId={filterGroupId} remoteEnabled={remoteEnabled}
      onSaved={(updated) => setPolicies((current) => current.map((item) => item._id === updated._id ? updated : item))} />)}
  </section>
}
