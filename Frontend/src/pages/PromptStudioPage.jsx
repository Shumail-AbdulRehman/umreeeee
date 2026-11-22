import { MessageSquare, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { executePromptWorkspaceRun, fetchPromptWorkspaceContext, fetchPromptWorkspaceRun, fetchConversations, fetchConversation } from '../services/promptWorkspace/promptWorkspaceService'
import { isAdmin } from '../utils/permissions'
import BrandMark from '../components/BrandMark'
import { Button } from '../components/ui/button'
import AssistantMarkdown from '../features/prompt-studio/AssistantMarkdown'
import PolicyNotice from '../features/prompt-studio/PolicyNotice'
import ChatHistory from '../features/prompt-studio/ChatHistory'
import Composer from '../features/prompt-studio/Composer'
import './workspace.css'

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

const runLabel = (status = '') => status.replaceAll('_', ' ')
const runTone = (status = '') => status.startsWith('blocked') ? 'blocked' : status === 'allowed' || status === 'legacy_completed' ? 'allowed' : status === 'processing' ? 'processing' : 'error'
const formatTime = (value) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

function Findings({ run }) {
  const matches = ['input_evaluation', 'output_evaluation'].flatMap((stage) =>
    (run[stage]?.rule_results || []).filter((item) => item.outcome === 'match').map((item) => ({ ...item, stage })))
  const errors = ['input_evaluation', 'output_evaluation'].flatMap((stage) => {
    const results = run[stage]?.rule_results || []
    const failed = results.filter((item) => item.outcome === 'error').map((item) => ({ ...item, stage }))
    const represented = new Set(failed.map((item) => item.reason_code))
    return [...failed, ...[...new Set(run[stage]?.errors || [])].filter((code) => !represented.has(code)).map((code) => ({ reason_code: code, stage }))]
  })
  if (!matches.length && !errors.length) return null
  return <section className="studio-findings" aria-label="Policy check details">
    <h3>Policy check details</h3>
    {matches.map((item, index) => <div className="studio-finding" key={item.rule_id + '-' + index}>
      <strong>{item.policy_name || item.type}</strong>
      <span>{item.stage === 'input_evaluation' ? 'Prompt' : 'Response'} · version {item.policy_version}</span>
      {item.evidence?.some((entry) => entry.entry_id) && <ul>{[...new Map(item.evidence.filter((entry) => entry.entry_id).map((entry) => [entry.entry_id, entry])).values()].map((entry) => <li key={entry.entry_id}>{entry.entry_name || entry.entry_id}</li>)}</ul>}
    </div>)}
    {errors.map((item, index) => <div className="studio-check-error" key={item.stage + '-' + index}>
      <strong>{item.policy_name || 'Security check'} · {item.stage === 'input_evaluation' ? 'Input' : 'Output'}</strong>
      <p>{validationMessages[item.reason_code] || 'A security check failed. Contact your administrator.'}</p>
      <code>{item.reason_code}</code>
    </div>)}
  </section>
}

function RunDetail({ run, currentUser }) {
  if (!run) return <div className="studio-empty"><span className="studio-empty-icon" aria-hidden="true"><BrandMark size={26} /></span>
    <h2>What would you like to explore?</h2><p>Your prompt runs through your organization’s applicable policies before it reaches the model.</p></div>
  return <div className="studio-thread">
    <div className="studio-run-meta"><span className={'studio-status studio-status-' + runTone(run.status)}>{runLabel(run.status)}</span><span>{formatTime(run.created_at)}</span><span>{run.model}</span></div>
    {run.prompt != null && !run.content_expired && <div className="studio-message studio-message-user"><span className="studio-message-label">You</span><p>{run.prompt}</p></div>}
    {run.status === 'blocked_input' && <div className="studio-outcome studio-outcome-blocked" role="alert"><strong>Prompt blocked by policy</strong><p>Your prompt was not sent to the model. Review the matched checks and remove restricted content.</p></div>}
    {run.status === 'blocked_output' && <div className="studio-outcome studio-outcome-blocked" role="alert"><strong>Response withheld</strong><p>The model response failed a policy check, so its text is not shown.</p></div>}
    {run.status === 'validation_error' && <div className="studio-outcome studio-outcome-error" role="alert"><strong>Security check could not complete</strong><p>This is a checking error, not proof of a policy violation. Unchecked content was withheld.</p></div>}
    {run.error_code === 'policy_required' && <div className="studio-outcome studio-outcome-error" role="alert"><strong>Message not sent</strong><p>No input policy was available under the configuration used for this message. Check your current workspace settings before retrying.</p>{isAdmin(currentUser) ? <a href="#users">Review my policy groups ↗</a> : <p>Ask your administrator to assign your policy groups.</p>}</div>}
    {run.error_message && run.error_code !== 'policy_required' && <div className="studio-outcome studio-outcome-error" role="alert">{run.error_message}</div>}
    {run.response_text != null && !run.response_withheld && !run.content_expired && <div className="studio-message studio-message-response"><div className="studio-response-head"><span className="studio-response-mark"><BrandMark size={16} /></span><strong>Averiq</strong><span>{run.model}</span></div><AssistantMarkdown text={run.response_text} withheld={run.response_withheld} expired={run.content_expired} /></div>}
    {run.content_expired && <p className="studio-muted">Stored text has expired; the decision record remains.</p>}
    {run.status === 'processing' && <div className="studio-thinking" role="status"><span className="studio-thinking-dot" />Checking policies and preparing your reply…</div>}
    {run.status !== 'processing' && <details className="studio-message-details" open={run.status === 'validation_error'}><summary>Security checks & usage <span className={'studio-status studio-status-' + runTone(run.status)}>{runLabel(run.status)}</span></summary><Findings run={run} />
    <dl className="studio-run-stats">
      <div><dt>Input tokens</dt><dd>{run.prompt_tokens ?? 'Unknown'}</dd></div>
      <div><dt>Output tokens</dt><dd>{run.completion_tokens ?? 'Unknown'}</dd></div>
      <div><dt>Estimated cost</dt><dd>{run.estimated_cost_usd == null ? 'Unknown' : '$' + run.estimated_cost_usd}</dd></div>
      <div><dt>Total time</dt><dd>{run.total_latency_ms == null ? 'Unknown' : run.total_latency_ms + ' ms'}</dd></div>
    </dl></details>}
  </div>
}

export default function PromptStudioPage({ runId = '', conversationId = '', currentUser }) {
  const [context, setContext] = useState({ integrations: [], groups: [] })
  const [history, setHistory] = useState({ items: [], total: 0, page_size: 20 })
  const [page, setPage] = useState(1)
  const [chat, setChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [messagePage, setMessagePage] = useState(1)
  const [messageTotal, setMessageTotal] = useState(0)
  const [form, setForm] = useState({ integration_id: '', model: '', prompt: '', temperature: 0.2, max_tokens: 1024 })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingChat, setLoadingChat] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [historyUnavailable, setHistoryUnavailable] = useState(false)
  const [historyReady, setHistoryReady] = useState(false)
  const [historyReload, setHistoryReload] = useState(0)
  const [pending, setPending] = useState(null)
  const [retry, setRetry] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [contextNote, setContextNote] = useState('Follow-ups use recent allowed messages. Blocked, failed and expired messages are excluded.')
  const promptRef = useRef(null)
  const bodyRef = useRef(null)
  const generation = useRef(0)
  const alive = useRef(true)
  const submitting = useRef(false)
  const scrollToEnd = useRef(false)
  const contextRef = useRef(context)

  useEffect(() => {
    alive.current = true
    let active = true
    fetchPromptWorkspaceContext().then((result) => {
      if (!active) return
      contextRef.current = result
      setContext(result)
      setForm((current) => {
        if (current.integration_id || !result.integrations?.length) return current
        const first = result.integrations[0]
        return { ...current, integration_id: first.id, model: first.models?.[0] || '' }
      })
    }).catch((problem) => { if (active) setError(problem.message) })
    return () => { active = false; alive.current = false; generation.current += 1 }
  }, [])

  useEffect(() => {
    let active = true
    fetchConversations(page).then((value) => {
      if (active) { setHistory(value); setHistoryLoading(false); setHistoryError(''); setHistoryReady(true); setHistoryUnavailable(false) }
    }).catch((problem) => {
      if (active) { setHistoryError(problem.message); setHistoryUnavailable(problem.code === 'conversation_api_unavailable'); setHistoryLoading(false) }
    })
    return () => { active = false }
  }, [page, historyReload])

  useEffect(() => {
    let active = true
    if (conversationId) {
      void show(conversationId)
    } else if (runId) {
      fetchPromptWorkspaceRun(runId).then((value) => {
        if (active) void show(value.run.conversation_id || value.run.id)
      }).catch((problem) => { if (active) setError(problem.message) })
    }
    return () => { active = false }
    // Route changes open persisted chats; show uses a generation fence for stale fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, runId])

  useEffect(() => {
    if (scrollToEnd.current && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
      scrollToEnd.current = false
    }
  }, [messages, pending, loadingChat])

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 961px)')
    function closeDrawer(event) { if (event.matches) setHistoryOpen(false) }
    desktop.addEventListener('change', closeDrawer)
    return () => desktop.removeEventListener('change', closeDrawer)
  }, [])

  const selected = context.integrations.find((item) => item.id === form.integration_id)
  const policySetupRequired = Boolean(context.require_active_policy && context.input_policy_coverage?.[form.integration_id] === false)
  const policyOptionalWithoutInput = context.require_active_policy === false && context.input_policy_coverage?.[form.integration_id] === false
  const optionalAdminPolicy = policyOptionalWithoutInput && isAdmin(currentUser)
  function replaceRoute(id) {
    window.history.replaceState(null, '', id ? `#prompt-studio?chat=${encodeURIComponent(id)}` : '#prompt-studio')
  }
  async function refreshHistory(historyPage = page) {
    try {
      const value = await fetchConversations(historyPage)
      if (alive.current) { setHistory(value); setHistoryError(''); setHistoryReady(true); setHistoryUnavailable(false) }
    } catch (problem) {
      if (alive.current) { setHistoryError(problem.message); setHistoryUnavailable(problem.code === 'conversation_api_unavailable') }
    }
  }
  function applyRun(run) {
    scrollToEnd.current = true
    setMessages((current) => current.some((item) => item.id === run.id)
      ? current.map((item) => item.id === run.id ? run : item) : [...current, run])
  }
  async function poll(id, fence) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      if (!alive.current || fence !== generation.current) return
      const response = await fetchPromptWorkspaceRun(id)
      if (!alive.current || fence !== generation.current) return
      if (response.run.status !== 'processing') { applyRun(response.run); await refreshHistory(); return }
    }
    if (alive.current) setError('This reply is still processing. Reopen this chat to check its status before sending again.')
  }
  async function show(id) {
    if (submitting.current) return
    const fence = ++generation.current
    setLoadingChat(true); setError(''); setPending(null); setRetry(null); setHistoryOpen(false)
    setChat(null); setMessages([]); setForm((current) => ({ ...current, prompt: '' }))
    try {
      const response = await fetchConversation(id)
      if (!alive.current || fence !== generation.current) return
      scrollToEnd.current = true
      setChat(response.conversation); setMessages(response.items); setMessagePage(1)
      setMessageTotal(response.total); setContextNote(response.context_note)
      const latest = response.items.at(-1)
      if (latest) setForm((current) => {
        const integration = contextRef.current.integrations.find((item) => item.id === latest.integration_id)
        return integration?.models?.includes(latest.model)
          ? { ...current, integration_id: latest.integration_id, model: latest.model } : current
      })
      replaceRoute(id)
      setLoadingChat(false)
      if (latest?.status === 'processing') {
        submitting.current = true; setBusy(true)
        try { await poll(latest.id, fence) } finally { submitting.current = false; if (alive.current) setBusy(false) }
      }
    } catch (problem) {
      if (alive.current && fence === generation.current) {
        setError(problem.code === 'not_found' ? 'This conversation could not be found in your account. Choose another chat or start a new one.' : problem.message)
        if (problem.code === 'conversation_api_unavailable') { setHistoryError(problem.message); setHistoryUnavailable(true) }
      }
    }
    finally { if (alive.current && fence === generation.current) setLoadingChat(false) }
  }
  async function loadOlder() {
    if (!chat || loadingOlder) return
    const fence = generation.current
    const previousHeight = bodyRef.current?.scrollHeight || 0
    setLoadingOlder(true)
    try {
      const response = await fetchConversation(chat.id, messagePage + 1)
      if (!alive.current || fence !== generation.current) return
      setMessages((current) => [...response.items, ...current]); setMessagePage(response.page)
      setMessageTotal(response.total)
      requestAnimationFrame(() => {
        if (bodyRef.current && fence === generation.current) bodyRef.current.scrollTop += bodyRef.current.scrollHeight - previousHeight
      })
    } catch (problem) { if (alive.current && fence === generation.current) setError(problem.message) }
    finally { if (alive.current) setLoadingOlder(false) }
  }
  async function submit(event) {
    event.preventDefault()
    if (submitting.current || !form.prompt.trim() || loadingChat || !historyReady || historyUnavailable || policySetupRequired) return
    submitting.current = true; setBusy(true); setError('')
    const fence = generation.current
    const payload = { ...form, ...(chat ? { conversation_id: chat.id } : {}) }
    const fingerprint = JSON.stringify(payload)
    const key = retry?.fingerprint === fingerprint ? retry.key : crypto.randomUUID()
    setRetry({ key, fingerprint })
    scrollToEnd.current = true
    setPending({ id: 'pending', prompt: form.prompt, model: form.model, status: 'processing', created_at: new Date().toISOString() })
    async function accept(run) {
      if (!alive.current || fence !== generation.current) return
      setPending(null); applyRun(run)
      if (!run.conversation_id) {
        setHistoryUnavailable(true)
        setHistoryError('The server recorded this reply without conversation support. Ask your administrator to update the backend, then retry loading chats.')
        setForm((current) => ({ ...current, prompt: '' })); setRetry(null)
        return
      }
      const id = run.conversation_id
      const title = chat?.title || form.prompt.trim().replace(/\s+/g, ' ').slice(0, 80)
      const duplicate = messages.some((item) => item.id === run.id)
      // Keep confirmed messages discoverable even if the next history GET fails.
      setHistory((current) => {
        const existing = current.items.find((item) => item.id === id)
        const item = { ...(existing || {}), id, title, model: run.model,
          created_at: existing?.created_at || run.created_at, updated_at: run.created_at,
          message_count: (existing?.message_count ?? messageTotal) + (duplicate ? 0 : 1) }
        return { ...current, total: current.total + (!chat && !existing ? 1 : 0),
          items: [item, ...current.items.filter((entry) => entry.id !== id)].slice(0, current.page_size) }
      })
      if (!chat) setChat({ id, title: form.prompt.trim().replace(/\s+/g, ' ').slice(0, 80) })
      replaceRoute(id)
      setForm((current) => ({ ...current, prompt: '' })); setRetry(null)
      if (!duplicate) setMessageTotal((current) => current + 1)
      try {
        if (!chat) setPage(1)
        await refreshHistory(chat ? page : 1)
        if (run.status === 'processing') await poll(run.id, fence)
      } catch (problem) {
        if (alive.current && fence === generation.current) setError(`The server accepted your message, but its status could not be refreshed. ${problem.message}`)
      }
    }
    try {
      const response = await executePromptWorkspaceRun(payload, key)
      await accept(response.run)
    } catch (problem) {
      if (!alive.current || fence !== generation.current) return
      if (problem.run) {
        try { await accept(problem.run) } catch (refreshError) { setError(refreshError.message) }
      } else {
        setPending(null)
        setError(`${problem.message} Your message is still in the composer; retrying it uses the same request key.`)
      }
    } finally {
      submitting.current = false
      if (alive.current && fence === generation.current) { setBusy(false); promptRef.current?.focus() }
    }
  }
  function newChat() {
    if (submitting.current) return
    generation.current += 1
    setChat(null); setMessages([]); setMessageTotal(0); setPending(null); setRetry(null)
    setForm((current) => ({ ...current, prompt: '' })); setError(''); setHistoryOpen(false); setLoadingChat(false)
    replaceRoute(null); promptRef.current?.focus()
  }
  function onComposerKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia('(min-width: 701px)').matches) {
      event.preventDefault()
      if (!busy && form.prompt.trim() && form.integration_id && form.model) event.currentTarget.form.requestSubmit()
    }
  }
  const turns = pending ? [...messages, pending] : messages
  function retryHistory() { setHistoryLoading(true); setHistoryReload((current) => current + 1) }
  return <div className="studio-page">
    <PolicyNotice context={context} policySetupRequired={policySetupRequired} optionalAdminPolicy={optionalAdminPolicy} policyOptionalWithoutInput={policyOptionalWithoutInput} currentUser={currentUser} />
    <div className="studio-layout">
      <ChatHistory history={history} historyLoading={historyLoading} historyError={historyError} historyUnavailable={historyUnavailable} page={page} busy={busy} chat={chat} onNewChat={newChat} onSelect={show} onPageChange={setPage} onRetry={retryHistory} open={historyOpen} onOpenChange={setHistoryOpen} formatTime={formatTime} />
      <section className="studio-workspace" aria-label="Conversation" inert={historyOpen ? true : undefined}>
        <header className="studio-workspace-head"><div><h2>{chat?.title || (loadingChat ? 'Opening chat…' : 'New chat')}</h2></div>
          <div className="studio-header-actions"><Button type="button" variant="outline" className="studio-history-toggle" aria-label="Chats" aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}><MessageSquare size={17} aria-hidden="true" /></Button><Button type="button" variant="outline" className="studio-header-new" onClick={newChat} disabled={busy} aria-label="New chat"><Plus size={17} aria-hidden="true" /></Button></div>
        </header>
        <div className="studio-workspace-body" ref={bodyRef} aria-busy={loadingChat} role="region" aria-label="Conversation messages" tabIndex={0}>
          {loadingChat ? <div className="studio-thread-loading" role="status"><span /><span /><span /><p>Opening your conversation…</p></div> : turns.length ? <div className="studio-conversation-thread">
            {messages.length < messageTotal && <button type="button" className="studio-load-older" disabled={loadingOlder || busy} onClick={loadOlder}>{loadingOlder ? 'Loading…' : 'Load earlier messages'}</button>}
            {turns.map((run) => <article className="studio-turn" key={run.id} aria-label={`Message sent ${formatTime(run.created_at)}`}><RunDetail run={run} currentUser={currentUser} /></article>)}
          </div> : <RunDetail run={null} />}
        </div>
        <Composer form={form} setForm={setForm} onSubmit={submit} onKeyDown={onComposerKeyDown} promptRef={promptRef} selected={selected} integrations={context.integrations} busy={busy} loadingChat={loadingChat} historyReady={historyReady} historyUnavailable={historyUnavailable} historyLoading={historyLoading} policySetupRequired={policySetupRequired} error={error} onRetryHistory={retryHistory} chat={chat} contextNote={contextNote} />
      </section>
    </div>
  </div>
}
