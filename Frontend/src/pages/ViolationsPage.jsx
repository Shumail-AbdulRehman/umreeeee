import { useEffect, useRef, useState } from 'react'
import { ShieldAlert, ArrowUpRight, CircleCheck, LoaderCircle, X } from 'lucide-react'
import { getViolation, listViolations, resolveViolation } from '../services/observability'
import { isAdmin } from '../utils/permissions'
import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import { Pagination, SectionHeader } from '../components/Surface'
import { formatDate } from '../lib/format'
import Modal from '../components/Modal'
import LoadingSurface from '../components/LoadingSurface'
import ViolationContext from '../components/ViolationContext'
import './violations.css'
export default function ViolationsPage({ currentUser }) {
  const detailVersion = useRef(0)
  const saveInFlight = useRef(false)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [result, setResult] = useState({ items: [], total: 0, page_size: 20 })
  const [selected, setSelected] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [detailError, setDetailError] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')
  const [needsReload, setNeedsReload] = useState(false)
  async function refresh() { setResult(await listViolations(`?${new URLSearchParams({ page: String(page), status })}`)) }
  useEffect(() => { void Promise.resolve().then(refresh).catch((problem) => setError(problem.message)) }, [page, status]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { detailVersion.current += 1 }, [])
  function closeDetail() { detailVersion.current += 1; setDetailId(null); setSelected(null); setDetailError(''); setNeedsReload(false) }
  async function open(id) {
    const version = ++detailVersion.current
    setDetailId(id); setSelected(null); setNote(''); setDetailError(''); setNeedsReload(false); setSavedMessage('')
    try {
      const item = (await getViolation(id)).violation
      if (version !== detailVersion.current) return
      setSelected(item); setNote(item.resolution_note || '')
    } catch (problem) { if (version === detailVersion.current) setDetailError(problem.message) }
  }
  async function save(next) {
    if (saveInFlight.current || !selected) return
    saveInFlight.current = true
    const version = detailVersion.current
    setBusy(next); setDetailError(''); setNeedsReload(false)
    try {
      const value = await resolveViolation(selected.id, { resolution_status: next, note, version: selected.version })
      const updated = value?.violation
      if (!updated || updated.id !== selected.id || updated.resolution_status !== next) {
        if (version === detailVersion.current) { setDetailError('The server did not confirm this status change. Reload the incident to check its latest status.'); setNeedsReload(true) }
        return
      }
      // Use only the record returned by the API. A list refresh is a separate result.
      setResult((current) => ({ ...current, items: current.items.map((item) => item.id === updated.id ? updated : item) }))
      if (version === detailVersion.current) closeDetail()
      setSavedMessage(next === 'resolved' ? 'Incident resolved.' : 'Incident marked reviewed.')
      try { await refresh(); setError('') }
      catch { setError('The incident was saved, but the list could not refresh. Reload the list to see the latest records.') }
    } catch (problem) {
      if (version === detailVersion.current) { setDetailError(problem.message); setNeedsReload(problem.status === 409 || problem.code === 'stale_version') }
    } finally { saveInFlight.current = false; setBusy(false) }
  }
  async function reloadDetail() {
    const version = detailVersion.current
    setBusy('reload')
    try {
      const value = await getViolation(detailId)
      if (version === detailVersion.current) { setSelected(value.violation); setDetailError(''); setNeedsReload(false) }
    } catch (problem) { if (version === detailVersion.current) setDetailError(problem.message) }
    finally { setBusy(false) }
  }
  return <div className="admin-stack">{savedMessage && <div className="violation-save-feedback" role="status" aria-atomic="true"><CircleCheck size={19} aria-hidden="true" /><div><strong>{savedMessage}</strong><span>Your changes have been saved.</span></div><button type="button" aria-label="Dismiss confirmation" onClick={() => setSavedMessage('')}><X size={16} /></button></div>}<div className="management-intro"><div><ShieldAlert size={23} /><span><strong>Policy incident review</strong><p>Recorded policy matches. A validator error alone is not a violation.</p></span></div><StatusBadge status="open">{result.total} matching incidents</StatusBadge></div><div className="admin-toolbar"><label>Resolution status<select aria-label="Filter resolution" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="">All resolutions</option><option value="open">Open</option><option value="reviewed">Reviewed</option><option value="resolved">Resolved</option></select></label></div>{error && <div className="admin-error" role="alert"><p>{error}</p><button type="button" className="btn" onClick={() => void refresh().then(() => setError('')).catch((problem) => setError(problem.message))}>Reload list</button></div>}<DataTable title="Recorded violations" description="Review policy evidence and track incident resolution." rows={result.items} emptyTitle="No matching incidents" emptyDescription="Policy matches appear here when recorded. Select another resolution filter to see other incidents." columns={[
    { id: 'when', label: 'Recorded', value: (item) => item.created_at, render: (item) => formatDate(item.created_at) },
    { id: 'policy', label: 'Policy', value: (item) => item.policy_name, render: (item) => <strong>{item.policy_name}</strong> },
    { id: 'severity', label: 'Severity', value: (item) => item.severity, render: (item) => <StatusBadge status={item.severity} /> },
    { id: 'action', label: 'Action', value: (item) => item.action },
    { id: 'stage', label: 'Stage', value: (item) => item.stage, className: 'capitalize' },
    { id: 'resolution', label: 'Resolution', value: (item) => item.resolution_status, render: (item) => <StatusBadge status={item.resolution_status} /> },
    { id: 'detail', label: 'Detail', required: true, render: (item) => <button className="btn" type="button" aria-label={`Open violation for ${item.policy_name}`} onClick={() => open(item.id)}>Open <ArrowUpRight size={13} /></button> },
  ]} /><Pagination page={page} pageSize={result.page_size} total={result.total} onPageChange={setPage} noun="violations" />{detailId && <Modal title="Violation detail" onClose={closeDetail} className="violation-detail-dialog"><div className="admin-stack">{!selected && !detailError && <LoadingSurface kind="violation-detail" label="Loading incident details…" />}{detailError && <div className="admin-error" role="alert"><p>{detailError}</p>{!selected && <button type="button" className="btn" onClick={() => open(detailId)}>Retry detail</button>}{selected && needsReload && <button type="button" className="btn" disabled={busy} onClick={reloadDetail}>{busy === 'reload' ? 'Reloading…' : 'Reload incident'}</button>}</div>}{selected && <><SectionHeader title={selected.policy_name} description={`${selected.category} · ${selected.stage} · policy version ${selected.policy_version}`} /><div className="detail-badges"><StatusBadge status={selected.severity} /><StatusBadge status={selected.resolution_status} /><span>{selected.action}</span></div><ViolationContext key={`${selected.id}:${selected.run_id}`} violation={selected} />{selected.run_id && <p><a href={`#prompt-studio?run_id=${encodeURIComponent(selected.run_id)}`}>Open this run’s safe detail ↗</a></p>}{isAdmin(currentUser) && <><label>Review note<textarea maxLength="2000" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add context for your team's review…" /></label></>}</>}</div>{selected && isAdmin(currentUser) && (<div className="violation-action-footer"><button type="button" className="btn" disabled={Boolean(busy) || needsReload || (selected.resolution_status === 'reviewed' && note === (selected.resolution_note || ''))} onClick={() => save('reviewed')}>{busy === 'reviewed' && <LoaderCircle size={14} className="violation-save-spinner" />}{busy === 'reviewed' ? 'Marking reviewed…' : selected.resolution_status === 'reviewed' ? note === (selected.resolution_note || '') ? 'Reviewed' : 'Save review note' : 'Mark reviewed'}</button><button type="button" className="btn primary" disabled={Boolean(busy) || needsReload || (selected.resolution_status === 'resolved' && note === (selected.resolution_note || ''))} onClick={() => save('resolved')}>{busy === 'resolved' && <LoaderCircle size={14} className="violation-save-spinner" />}{busy === 'resolved' ? 'Resolving…' : selected.resolution_status === 'resolved' ? note === (selected.resolution_note || '') ? 'Resolved' : 'Save resolution note' : 'Resolve'}</button></div>)}</Modal>}</div>
}
