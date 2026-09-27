import { useEffect, useState } from 'react'
import { executePromptWorkspaceRun, fetchPromptWorkspaceContext, fetchPromptWorkspaceRun, fetchPromptWorkspaceRuns } from '../services/promptWorkspace/promptWorkspaceService'

const validationMessages = {
  remote_detection_disabled: 'Security checking is disabled. Ask your administrator to enable it.',
  detector_key_missing: 'The DLP service key is missing. Contact your administrator.',
  detector_timeout: 'The security service took too long to respond. Your prompt was not approved.',
  stage_timeout: 'Security checking exceeded its time limit. Your prompt was not approved.',
  detector_http_error: 'The security service rejected the check. Contact your administrator.',
  detector_invalid_response: 'The security service returned an unexpected result. Content has been withheld.',
  detector_incomplete_response: 'Not all selected security checks completed. Content has been withheld.',
  detector_unavailable: 'The security service could not be reached. Try again later.',
  invalid_detector_selection: 'The assigned policy selection is invalid. Contact your administrator.',
}

function RunDetail({ run }) {
  if (!run) return <p>Select a run to see its outcome.</p>
  return <div className="admin-stack"><p><strong>{run.status.replaceAll('_', ' ')}</strong> · {new Date(run.created_at).toLocaleString()}</p>
    {run.status === 'blocked_input' && <div className="admin-error" role="alert"><strong>Prompt blocked by your group’s security policy.</strong><p>Your prompt was not sent to the AI model. Review the matched checks below and remove the restricted content.</p></div>}
    {run.status === 'blocked_output' && <div className="admin-error" role="alert"><strong>Response blocked by your group’s security policy.</strong><p>The generated response failed a check and has not been shown.</p></div>}
    {run.status === 'validation_error' && <div className="admin-error" role="alert"><strong>Security check could not complete.</strong><p>This is a checking error, not confirmation of a policy violation. No unchecked response will be shown.</p></div>}
    {run.error_message && <p className="admin-error">{run.error_message}</p>}
    {['input_evaluation', 'output_evaluation'].map((stage) => run[stage] && <div key={stage}><strong>{stage.startsWith('input') ? 'Input' : 'Output'}: {run[stage].state.replaceAll('_', ' ')}</strong>
      {run[stage].rule_results?.filter((item) => item.outcome === 'match').map((item, index) => <div key={`${item.rule_id}-${index}`}><p><strong>{item.policy_name || item.type}</strong> · {item.field === 'user_prompt' ? 'Your prompt' : item.field === 'response_text' ? 'AI response' : 'System instruction'} · version {item.policy_version}</p>
        {item.evidence?.some((e) => e.entry_id) && <ul>{[...new Map(item.evidence.filter((e) => e.entry_id).map((e) => [e.entry_id, e])).values()].map((e) => <li key={e.entry_id}>{e.entry_name || e.entry_id}</li>)}</ul>}</div>)}
      {run[stage].errors?.length > 0 && <div className="admin-error">{[...new Set(run[stage].errors)].map((code) => <p key={code}>{validationMessages[code] || 'A security check failed. Contact your administrator.'}</p>)}</div>}</div>)}
    {run.content_expired && <p>Stored text has expired; the decision record remains.</p>}
    {run.prompt != null && <div><strong>Prompt</strong><pre className="admin-response">{run.prompt}</pre></div>}
    {run.response_withheld ? <p role="status">Generated response withheld. No response text is available.</p> :
      run.response_text != null ? <div><strong>Response</strong><pre className="admin-response">{run.response_text}</pre></div> : <p>No response text is available.</p>}
    <p>Input {run.prompt_tokens ?? 'unknown'} tokens · Output {run.completion_tokens ?? 'unknown'} tokens · Estimated cost {run.estimated_cost_usd == null ? 'unknown' : `$${run.estimated_cost_usd}`} ({run.cost_status || 'unknown'}{run.cost_source === 'litellm' ? ' · automatic pricing' : run.cost_source === 'configured' ? ' · custom pricing' : ''})</p>
    <p>Validation {run.enforcement_latency_ms ?? 'unknown'} ms · Provider {run.provider_latency_ms ?? 'unknown'} ms · Total {run.total_latency_ms ?? 'unknown'} ms</p>
  </div>
}

export default function PromptStudioPage({ runId = '' }) {
  const [context, setContext] = useState({ integrations: [], groups: [] })
  const [history, setHistory] = useState({ items: [], total: 0, page_size: 20 })
  const [page, setPage] = useState(1)
  const [form, setForm] = useState({ integration_id: '', model: '', prompt: '', temperature: 0.2, max_tokens: 1024 })
  const [latest, setLatest] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(null)

  useEffect(() => { fetchPromptWorkspaceContext().then(setContext).catch((problem) => setError(problem.message)) }, [])
  useEffect(() => { fetchPromptWorkspaceRuns(page).then(setHistory).catch((problem) => setError(problem.message)) }, [page])
  useEffect(() => { if (runId) fetchPromptWorkspaceRun(runId).then((result) => setLatest(result.run)).catch((problem) => setError(problem.message)) }, [runId])
  const selected = context.integrations.find((item) => item.id === form.integration_id)
  async function refresh() { setHistory(await fetchPromptWorkspaceRuns(page)) }
  async function show(id) { try { setLatest((await fetchPromptWorkspaceRun(id)).run); setError('') } catch (problem) { setError(problem.message) } }
  async function poll(id) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const response = await fetchPromptWorkspaceRun(id)
      if (response.run.status !== 'processing') { setLatest(response.run); await refresh(); return }
    }
    setError('Run is still processing. Open it from history to check again.')
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    const fingerprint = JSON.stringify(form)
    const key = retry?.fingerprint === fingerprint ? retry.key : crypto.randomUUID()
    setRetry({ key, fingerprint })
    try {
      const response = await executePromptWorkspaceRun(form, key)
      setLatest(response.run)
      if (response.run.status === 'processing') await poll(response.run.id)
      else { setRetry(null); await refresh() }
    } catch (problem) {
      setError(problem.message)
      if (problem.run) { setLatest(problem.run); setRetry(null); await refresh() }
    } finally { setBusy(false) }
  }
  return <div className="admin-stack">
    <div className="admin-notice" role="status">{context.enforcement_ready === false ? context.readiness_reason : 'Prompts are checked against applicable active policies. A validation failure withholds unchecked content.'}</div>
    <div className="admin-grid two"><form className="admin-panel admin-stack" onSubmit={submit}><h2>New prompt</h2>
      <label>Integration<select required value={form.integration_id} onChange={(event) => setForm({ ...form, integration_id: event.target.value, model: '' })}><option value="">Select an integration</option>{context.integrations.map((item) => <option key={item.id} value={item.id}>{item.account_name} · {item.provider}</option>)}</select></label>
      <label>Model<select required value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })}><option value="">Select a model</option>{selected?.models.map((model) => <option key={model}>{model}</option>)}</select></label>
      <label>Prompt<textarea required minLength="1" maxLength="24000" rows="8" value={form.prompt} onChange={(event) => setForm({ ...form, prompt: event.target.value })} /></label>
      <div className="admin-grid two"><label>Temperature<input type="number" min="0" max="2" step="0.1" value={form.temperature} onChange={(event) => setForm({ ...form, temperature: Number(event.target.value) })} /></label><label>Max tokens<input type="number" min="1" max="8192" value={form.max_tokens} onChange={(event) => setForm({ ...form, max_tokens: Number(event.target.value) })} /></label></div>
      <p>Effective groups: {context.groups.length ? context.groups.map((group) => group.name).join(', ') : 'none'}. Administrators manage group scope.</p>
      {error && <div className="admin-error" role="alert">{error}</div>}
      <button className="btn primary" disabled={busy || !form.integration_id || !form.model}>{busy ? 'Checking and running…' : 'Run prompt'}</button></form>
      <section className="admin-panel"><h2>Run detail</h2><RunDetail run={latest} /></section></div>
    <section className="admin-panel"><h2>Run history</h2>{history.items.length === 0 ? <p>No runs yet.</p> : <div className="admin-scroll"><table className="admin-table"><thead><tr><th>When</th><th>Model</th><th>Status</th><th>Cost estimate</th><th>Detail</th></tr></thead><tbody>{history.items.map((run) => <tr key={run.id}><td>{new Date(run.created_at).toLocaleString()}</td><td>{run.model}</td><td>{run.status.replaceAll('_', ' ')}</td><td>{run.estimated_cost_usd == null ? 'Unknown' : `$${run.estimated_cost_usd}`}</td><td><button className="btn" onClick={() => show(run.id)}>Open</button></td></tr>)}</tbody></table></div>}
      <div className="admin-pagination"><span>{history.total} runs</span><button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="btn" disabled={page * history.page_size >= history.total} onClick={() => setPage(page + 1)}>Next</button></div></section>
  </div>
}
