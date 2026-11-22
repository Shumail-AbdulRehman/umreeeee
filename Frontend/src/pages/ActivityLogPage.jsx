import { useEffect, useState } from 'react'
import { Activity, ArrowUpRight, X } from 'lucide-react'
import { fetchPromptWorkspaceRun, fetchPromptWorkspaceRuns } from '../services/promptWorkspace/promptWorkspaceService'
import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import { Pagination, SectionHeader } from '../components/Surface'
import { formatDate, formatMoney, formatNumber } from '../lib/format'
export default function ActivityLogPage({ runId = '', filterStatus = '' }) {
  const [page, setPage] = useState(1)
  const [result, setResult] = useState({ items: [], total: 0, page_size: 20 })
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { fetchPromptWorkspaceRuns(page, filterStatus).then(setResult).catch((problem) => setError(problem.message)) }, [page, filterStatus])
  useEffect(() => { if (runId) fetchPromptWorkspaceRun(runId).then((value) => setDetail(value.run)).catch((problem) => setError(problem.message)) }, [runId])
  async function open(id) { try { setDetail((await fetchPromptWorkspaceRun(id)).run) } catch (problem) { setError(problem.message) } }
  return <div className="admin-stack">{error && <div className="admin-error" role="alert">{error}</div>}<div className="management-intro"><div><Activity size={22} /><span><strong>A traceable record of your prompts</strong><p>Inspect recorded outcomes, model usage, and permitted response content.</p></span></div></div><div className="admin-toolbar"><label>Run status<select value={filterStatus} onChange={(event) => { setPage(1); window.location.hash = event.target.value ? `activity-log?status=${encodeURIComponent(event.target.value)}` : 'activity-log' }}><option value="">All statuses</option>{['allowed', 'blocked_input', 'blocked_output', 'provider_error', 'validation_error', 'configuration_error', 'interrupted'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label></div><DataTable title="Prompt activity" description="Recorded runs visible to your account. Open a run to inspect its detail." rows={result.items} emptyTitle="No recorded runs" emptyDescription="Your prompt activity will appear after you send a message. Try another status filter if one is selected." columns={[
    { id: 'when', label: 'Submitted', value: (row) => row.created_at, render: (row) => formatDate(row.created_at) },
    { id: 'user', label: 'Person', value: (row) => row.user_name },
    { id: 'model', label: 'Model / provider', value: (row) => row.model, render: (row) => <><strong>{row.model}</strong><small>{row.provider}</small></> },
    { id: 'status', label: 'Outcome', value: (row) => row.status, render: (row) => <StatusBadge status={row.status} /> },
    { id: 'tokens', label: 'Tokens', value: (row) => row.total_tokens, render: (row) => formatNumber(row.total_tokens) },
    { id: 'cost', label: 'Cost estimate', value: (row) => row.estimated_cost_usd == null ? null : Number(row.estimated_cost_usd), render: (row) => formatMoney(row.estimated_cost_usd) },
    { id: 'detail', label: 'Detail', required: true, render: (row) => <button className="btn" onClick={() => open(row.id)}>Open <ArrowUpRight size={13} /></button> },
  ]} /><Pagination page={page} pageSize={result.page_size} total={result.total} onPageChange={setPage} noun="runs" />{detail && <section className="admin-panel admin-stack"><SectionHeader title="Run detail" description={detail.id} action={<button className="btn" aria-label="Close run detail" onClick={() => setDetail(null)}><X size={15} />Close</button>} /><div><StatusBadge status={detail.status} /><span className="detail-date">{formatDate(detail.created_at)}</span></div>{detail.error_message && <p className="admin-error">{detail.error_message}</p>}{detail.content_expired && <p className="admin-notice">Stored content expired; audit metadata remains.</p>}{detail.prompt != null && <div><span className="eyebrow">Submitted prompt</span><pre className="admin-response">{detail.prompt}</pre></div>}{detail.response_withheld ? <p className="admin-notice">Generated response withheld.</p> : detail.response_text && <div><span className="eyebrow">Permitted response</span><pre className="admin-response">{detail.response_text}</pre></div>}<p><a href={`#prompt-studio?run_id=${encodeURIComponent(detail.id)}`}>Open full decision detail ↗</a></p></section>}</div>
}
