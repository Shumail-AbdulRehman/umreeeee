import { useEffect, useState } from 'react'
import { AlertTriangle, FileText, LoaderCircle, RotateCw } from 'lucide-react'
import { fetchPromptWorkspaceRun } from '../services/promptWorkspace/promptWorkspaceService'
import { formatDate, readable } from '../lib/format'

const types = { catalog: 'Policy catalog check', pii: 'Personal information check', keyword: 'Keyword check', regex: 'Pattern check', prompt_injection: 'Prompt injection check', toxicity: 'Toxicity check' }
const fields = { user_prompt: 'Submitted prompt', prompt: 'Submitted prompt', system_prompt: 'System instructions', response: 'Model response', response_text: 'Model response' }
const evidenceNames = { keyword: 'Keyword match', regex: 'Pattern match', EMAIL_ADDRESS: 'Email address', PHONE_NUMBER: 'Phone number', CREDIT_CARD: 'Credit card', dlp_pattern: 'Sensitive data pattern', guardrail: 'Safety check' }

function recordedMatches(violation, run) {
  const stage = violation.stage === 'output' ? 'output_evaluation' : 'input_evaluation'
  const fromRun = (run?.[stage]?.rule_results || []).filter((item) => item.outcome === 'match' && (violation.policy_id ? item.policy_id === violation.policy_id : item.policy_name === violation.policy_name && (violation.policy_version == null || item.policy_version === violation.policy_version)))
  const matches = new Map()
  const incidentOnly = (violation.findings || []).filter((item) => !fromRun.some((match) => item.rule_id ? match.rule_id === item.rule_id : match.type === item.type && (!item.field || match.field === item.field)))
  for (const item of [...incidentOnly, ...fromRun]) {
    if (['pass', 'error'].includes(item.outcome)) continue
    const key = item.rule_id || `${item.type}:${item.field || ''}`
    const previous = matches.get(key)
    if (!previous || (item.evidence?.length || 0) > (previous.evidence?.length || 0)) matches.set(key, item)
  }
  return [...matches.values()]
}
function explanation(violation, run) {
  if (violation.action?.toUpperCase() === 'ALERT') return 'This policy recorded an alert. Review the run outcome to see whether execution was blocked.'
  if (run?.status === 'blocked_input') return 'The prompt matched a blocking policy and was not sent to the model.'
  if (run?.status === 'blocked_output') return 'The generated response matched a blocking policy and was withheld.'
  if (violation.action?.toUpperCase() === 'BLOCK') return `This incident records a blocking policy match during ${violation.stage === 'output' ? 'response' : 'input'} checking.`
  return 'A configured policy matched during this run. The recorded checks are shown below.'
}
export default function ViolationContext({ violation }) {
  const [report, setReport] = useState({ loading: true, run: null, error: '' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!violation.run_id) return
    let active = true
    fetchPromptWorkspaceRun(violation.run_id).then((value) => {
      if (active) setReport({ loading: false, run: value.run, error: '' })
    }).catch((problem) => {
      if (active) setReport({ loading: false, run: null, error: problem.status === 403 || problem.status === 404 ? 'The linked run is unavailable to your account.' : problem.message })
    })
    return () => { active = false }
  }, [violation.run_id, attempt])
  const matches = recordedMatches(violation, report.run)
  function retry() { setReport({ loading: true, run: null, error: '' }); setAttempt((current) => current + 1) }
  return <div className="violation-context">
    <section className="violation-explanation" aria-labelledby="violation-explanation-heading"><div className="violation-context-heading"><AlertTriangle size={17} aria-hidden="true" /><h3 id="violation-explanation-heading">{violation.action?.toUpperCase() === 'BLOCK' ? 'Why this was blocked' : 'Why this was flagged'}</h3></div><p>{explanation(violation, report.run)}</p>
      {matches.length ? <ul className="violation-check-list">{matches.map((item, index) => {
        const evidence = [...new Map((item.evidence || []).map((entry) => [entry.entry_id || `${entry.kind}:${entry.start}:${entry.end}`, entry])).values()]
        return <li key={item.rule_id || index}><div className="violation-check-heading"><strong>{types[item.type] || readable(item.type)}</strong>{item.field && <span>{fields[item.field] || readable(item.field)}</span>}</div>{evidence.length > 0 && <ul>{evidence.map((entry, i) => <li key={entry.entry_id || i}>{entry.entry_name || (entry.entry_id ? `Check ID: ${entry.entry_id}` : evidenceNames[entry.kind] || readable(entry.kind))}</li>)}</ul>}{item.reason_code && <p className="violation-recorded-reason">Recorded reason: {readable(item.reason_code)}</p>}{!evidence.length && !item.reason_code && <p className="violation-reason-missing">The policy matched, but no more specific check description was recorded.</p>}{Number.isFinite(item.score) && <p className="violation-recorded-reason">Recorded score: {item.score}{Number.isFinite(item.threshold) ? ` · Configured threshold: ${item.threshold}` : ''}</p>}</li>
      })}</ul> : <p className="violation-reason-missing">No individual check details were retained for this incident.</p>}
    </section>
    <section className="violation-prompt-section" aria-labelledby="violation-prompt-heading"><div className="violation-context-heading"><FileText size={16} aria-hidden="true" /><h3 id="violation-prompt-heading">Submitted prompt</h3></div>
      {!violation.run_id ? <p className="violation-content-notice">This incident has no linked run, so the submitted prompt is unavailable.</p> : report.loading ? <div className="violation-context-loading" role="status"><LoaderCircle size={15} className="violation-save-spinner" aria-hidden="true" />Loading the recorded prompt…</div> : report.error ? <div className="violation-run-error" role="alert"><p>{report.error}</p><button type="button" className="btn" onClick={retry}><RotateCw size={13} />Retry prompt</button></div> : report.run?.content_expired ? <p className="violation-content-notice">The prompt text has expired under your organization’s retention policy. The incident and recorded check details remain available.</p> : report.run?.prompt != null ? <pre className="violation-prompt-text">{report.run.prompt || '(Empty prompt)'}</pre> : <p className="violation-content-notice">Prompt text was not retained or is unavailable for this run.</p>}
      {report.run && <div className="violation-run-context">{report.run.user_name && <span>{report.run.user_name}</span>}{report.run.model && <span>{report.run.model}</span>}{report.run.created_at && <span>{formatDate(report.run.created_at)}</span>}</div>}
      {report.run?.status === 'blocked_output' && <p className="violation-content-notice">The block applies to the model response. Its withheld text is not displayed.</p>}
    </section>
  </div>
}
