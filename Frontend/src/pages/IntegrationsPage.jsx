import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import { Pagination } from '../components/Surface'
import { useEffect, useRef, useState } from 'react'
import { createLLMIntegration, fetchAvailableLLMModels, fetchLLMIntegrationPage, fetchStoredModels, setIntegrationStatus, updateLLMIntegration } from '../services/integrations/llmIntegrationService'
import Modal from '../components/Modal'
import FieldErrors from '../components/FieldErrors'
import { ArrowRight, Check, KeyRound, Loader2, Search, Server, ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-react'
import { Button } from '../components/ui/button'
import openaiMark from '../assets/providers/openai.svg'
import groqMark from '../assets/providers/groq.svg'
import ollamaMark from '../assets/providers/ollama.svg'
import geminiMark from '../assets/providers/gemini.svg'
import deepseekMark from '../assets/providers/deepseek.svg'
import anthropicMark from '../assets/providers/anthropic.svg'
import './IntegrationsPage.css'

const providers = [
  { id: 'openai', name: 'OpenAI', mark: openaiMark, description: 'GPT models for reasoning, writing, and everyday work.', type: 'API key' },
  { id: 'groq', name: 'Groq', mark: groqMark, description: 'Fast inference for supported open-weight models.', type: 'API key' },
  { id: 'ollama', name: 'Ollama', mark: ollamaMark, description: 'Connect models running on your own infrastructure.', type: 'Local server' },
  { id: 'gemini', name: 'Gemini', mark: geminiMark, description: 'Google’s model family for a wide range of tasks.', type: 'API key' },
  { id: 'deepseek', name: 'DeepSeek', mark: deepseekMark, description: 'DeepSeek models for chat and complex reasoning.', type: 'API key' },
  { id: 'anthropic', name: 'Anthropic', mark: anthropicMark, description: 'Claude models for thoughtful, capable assistance.', type: 'API key' },
]
const modelLimit = 50
const blank = { provider: 'openai', account_name: '', api_key: '', models: [], model_prices: [], system_prompt: '', base_url: '' }

export default function IntegrationsPage({ openCreateIntegration = false }) {
  const discoveryVersion = useRef(0)
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [editing, setEditing] = useState(openCreateIntegration ? {} : null)
  const [form, setForm] = useState(blank)
  const [models, setModels] = useState([])
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [discovered, setDiscovered] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const provider = providers.find((item) => item.id === form.provider) || providers[0]
  const visibleModels = models.filter((model) => model.toLowerCase().includes(modelSearch.trim().toLowerCase()))

  async function refresh() {
    try { const result = await fetchLLMIntegrationPage(page); setItems(result.items); setTotal(result.total); setError('') }
    catch (problem) { setError(problem.message) }
  }
  useEffect(() => { void Promise.resolve().then(refresh) }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  function open(item = null, providerId = 'openai') {
    discoveryVersion.current += 1
    setEditing(item || {})
    setForm(item ? { provider: item.provider, account_name: item.account_name, api_key: '',
      models: item.models, model_prices: item.model_prices || [], system_prompt: item.system_prompt || '', base_url: item.base_url || '', version: item.version } : { ...structuredClone(blank), provider: providerId })
    setModels(item?.models || [])
    setModelSearch('')
    setDiscovering(false)
    setDiscovered(Boolean(item?.models?.length))
    setError('')
    setFieldErrors({})
  }
  function changeConnectionField(field, value) {
    discoveryVersion.current += 1
    setDiscovering(false)
    setDiscovered(false)
    setModels([])
    setModelSearch('')
    setForm((current) => ({ ...current, [field]: value, models: [] }))
  }
  function closeEditor() {
    discoveryVersion.current += 1
    setDiscovering(false)
    setEditing(null)
  }
  async function discover() {
    const requestVersion = ++discoveryVersion.current
    setDiscovering(true)
    try {
      const response = editing?.id && !form.api_key.trim()
        ? await fetchStoredModels(editing.id)
        : await fetchAvailableLLMModels({ provider: form.provider, api_key: form.api_key || null, base_url: form.base_url || null })
      if (requestVersion === discoveryVersion.current) {
        setModels(response.models)
        setDiscovered(true)
        setForm((current) => ({ ...current, models: current.models.filter((model) => response.models.includes(model)) }))
        setError('')
      }
    } catch (problem) { if (requestVersion === discoveryVersion.current) setError(problem.message) }
    finally { if (requestVersion === discoveryVersion.current) setDiscovering(false) }
  }
  async function save(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const body = { ...form, model_prices: form.model_prices.filter((item) => item.input_usd_per_million !== '' && item.output_usd_per_million !== '').map(({ model, input_usd_per_million, output_usd_per_million }) => ({ model, input_usd_per_million, output_usd_per_million })), api_key: form.api_key || null, base_url: form.provider === 'ollama' ? form.base_url || null : null }
      const response = editing?.id ? await updateLLMIntegration(editing.id, body) : await createLLMIntegration(body)
      setMessage(response.message); setFieldErrors({}); closeEditor(); await refresh()
    } catch (problem) { setError(problem.message); setFieldErrors(problem.fieldErrors || {}) }
    finally { setBusy(false) }
  }
  async function toggle(item) {
    const target = item.status === 'active' ? 'archived' : 'active'
    if (target === 'archived' && !window.confirm(`Archive ${item.account_name}? Explicit policy references must be removed first.`)) return
    setBusy(true)
    try { await setIntegrationStatus(item.id, target, item.version); await refresh() }
    catch (problem) { setError(problem.message) }
    finally { setBusy(false) }
  }
  return <div className="admin-stack integrations-page">
    <section className="provider-directory" aria-labelledby="provider-directory-title">
      <div className="provider-directory-heading"><div><span className="integration-eyebrow">PROVIDER LIBRARY</span><h2 id="provider-directory-title">Choose where your AI runs.</h2><p>Connect an account, load its available models, and choose what your team can use.</p></div><span className="provider-security"><ShieldCheck size={15} /> Encrypted credentials</span></div>
      <div className="provider-grid">{providers.map((item) => <button key={item.id} className="provider-card" onClick={() => open(null, item.id)} aria-label={`Connect ${item.name}`}><span className="provider-card-top"><span className="provider-identity"><img src={item.mark} alt="" width="28" height="28" /><strong>{item.name}</strong></span><span className="provider-type">{item.type}</span></span><span className="provider-description">{item.description}</span><span className="provider-card-action">Connect provider <ArrowRight size={15} /></span></button>)}</div>
    </section>
    <div className="admin-toolbar integration-table-toolbar"><p>Manage your connected accounts and team access to models.</p><Button variant="outline" onClick={() => open()}>New integration</Button></div>
    {message && <div className="admin-notice" role="status">{message}</div>}{error && <div className="admin-error" role="alert">{error}</div>}
    <DataTable title="Provider connections" description="Organization-owned accounts and the models enabled for Prompt Studio." rows={items} emptyTitle="Connect your first provider" emptyDescription="Add a provider account and choose its models to enable Prompt Studio." columns={[
      { id: 'account', label: 'Account', value: (item) => item.account_name, render: (item) => <div className="person-cell"><span className="person-monogram">{providers.find((provider) => provider.id === item.provider) ? <img src={providers.find((provider) => provider.id === item.provider).mark} alt="" width="18" height="18" /> : item.provider?.[0]?.toUpperCase()}</span><strong>{item.account_name}</strong></div> },
      { id: 'provider', label: 'Provider', value: (item) => item.provider, render: (item) => providers.find((provider) => provider.id === item.provider)?.name || item.provider },
      { id: 'models', label: 'Enabled models', value: (item) => item.models.length, render: (item) => <div className="table-models">{item.models.map((model) => <span className="model-chip" key={model}>{model}</span>)}</div> },
      { id: 'credential', label: 'Credential', render: (item) => <span className="credential-masked">{item.has_api_key ? item.masked_api_key : 'None'}</span> },
      { id: 'policies', label: 'Policies', value: (item) => item.policy_count || 0, render: (item) => <a href={`#policies?integration_id=${item.id}`}>{item.policy_count || 0} policies</a> },
      { id: 'status', label: 'Status', value: (item) => item.status, render: (item) => <StatusBadge status={item.status} /> },
      { id: 'actions', label: 'Actions', required: true, render: (item) => <div className="table-actions"><button className="btn" onClick={() => open(item)}>Edit</button><button className="btn" disabled={busy} onClick={() => toggle(item)}>{item.status === 'active' ? 'Archive' : 'Restore'}</button></div> },
    ]} />
    <Pagination page={page} total={total} onPageChange={setPage} noun="integrations" />
    {editing && <Modal title={editing.id ? 'Edit integration' : `Connect ${provider.name}`} onClose={closeEditor} dirty wide className="integration-editor">
      <form onSubmit={save} className="integration-form">
        <div className="integration-editor-body">
          <div className="connection-intro"><span className="connection-mark"><img src={provider.mark} alt="" width="32" height="32" /></span><div><strong>{provider.name}</strong><p>{editing.id ? 'Update your connection and enabled models.' : 'One connection. The models your team needs.'}</p></div><span className="connection-selection"><Check size={14} /> {form.models.length} selected</span></div>
          <div className="connection-layout">
            <section className="connection-credentials" aria-labelledby="connection-credentials-title">
              <div className="connection-section-heading"><KeyRound size={16} /><h3 id="connection-credentials-title">Connection details</h3></div>
              <label>Provider<select aria-label="Provider" value={form.provider} disabled={Boolean(editing.id)} onChange={(event) => changeConnectionField('provider', event.target.value)}>{providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><FieldErrors errors={fieldErrors} field="provider" /></label>
              <label>Account name<input autoFocus required minLength="2" maxLength="160" placeholder="e.g. Product workspace" value={form.account_name} onChange={(event) => setForm({ ...form, account_name: event.target.value })} /><FieldErrors errors={fieldErrors} field="account_name" /></label>
              <label>API key {editing.id || form.provider === 'ollama' ? '(optional)' : '(required)'}<input type="password" autoComplete="off" maxLength="512" placeholder={editing.id ? 'Leave blank to keep the current key' : 'Enter your provider API key'} required={!editing.id && form.provider !== 'ollama'} value={form.api_key} onChange={(event) => changeConnectionField('api_key', event.target.value)} /><FieldErrors errors={fieldErrors} field="api_key" /></label>
              {form.provider === 'ollama' && <label>Allowed Ollama origin (optional)<input placeholder="http://127.0.0.1:11434" maxLength="500" value={form.base_url} onChange={(event) => changeConnectionField('base_url', event.target.value)} /><FieldErrors errors={fieldErrors} field="base_url" /></label>}
              <p className="connection-key-help">{editing.id ? 'Leave the key blank to use your saved credential.' : form.provider === 'ollama' ? 'Use an origin allowed by your server configuration.' : 'Your key is encrypted when saved. Only a masked version is returned.'}</p>
              <Button type="button" variant="outline" className="load-models-button" disabled={discovering || busy || (!editing.id && form.provider !== 'ollama' && !form.api_key.trim())} onClick={discover}>{discovering ? <Loader2 size={15} className="integration-spinner" /> : <Sparkles size={15} />}{discovering ? 'Loading models…' : discovered ? 'Reload models' : 'Load models'}</Button>
            </section>
            <section className="connection-models" aria-labelledby="connection-models-title" aria-busy={discovering}>
              <div className="connection-section-heading"><Server size={16} /><h3 id="connection-models-title">Enabled models</h3><span>{models.length ? `${models.length} available` : 'From your account'}</span></div>
              {models.length > 0 && <><label className="model-search"><Search size={15} /><input type="search" aria-label="Search available models" placeholder="Search model names…" value={modelSearch} onChange={(event) => setModelSearch(event.target.value)} /></label><div className="model-selection-tools"><Button type="button" variant="ghost" size="sm" disabled={busy || discovering || models.length > modelLimit || form.models.length === models.length} onClick={() => setForm((current) => ({ ...current, models: [...models] }))}>Select all</Button><Button type="button" variant="ghost" size="sm" disabled={busy || discovering || !form.models.length} onClick={() => setForm((current) => ({ ...current, models: [] }))}>Clear selection</Button><span role="status">{form.models.length} / {modelLimit} selected</span></div>{models.length > modelLimit && <p className="model-limit-note">This provider returned more than 50 models. Choose up to 50 for this connection.</p>}</>}
              <div className="model-picker">
                {discovering ? <div className="model-picker-state" role="status"><Loader2 size={24} className="integration-spinner" /><strong>Loading available models</strong><p>Checking this connection with {provider.name}.</p></div> : models.length ? visibleModels.length ? visibleModels.map((model) => <label className={`model-choice ${form.models.includes(model) ? 'is-selected' : ''}`} key={model}><input type="checkbox" checked={form.models.includes(model)} disabled={busy || (form.models.length >= modelLimit && !form.models.includes(model))} onChange={() => setForm((current) => ({ ...current, models: current.models.includes(model) ? current.models.filter((item) => item !== model) : [...current.models, model] }))} /><span>{model}</span>{form.models.includes(model) && <Check size={14} aria-hidden="true" />}</label>) : <div className="model-picker-state"><Search size={24} /><strong>No matching models</strong><p>Try a different name or clear your search.</p><Button type="button" variant="outline" size="sm" onClick={() => setModelSearch('')}>Clear search</Button></div> : <div className="model-picker-state"><Server size={26} /><strong>{discovered ? 'No models returned' : 'Your models will appear here'}</strong><p>{discovered ? 'Check the account permissions or server configuration, then reload.' : 'Enter your connection details and load models to choose the ones your team can use.'}</p></div>}
              </div>
              <p className="model-selection-help">Select at least one model. Only selected models are enabled for this connection.</p><FieldErrors errors={fieldErrors} field="models" />
            </section>
          </div>
          <details className="connection-advanced"><summary><SlidersHorizontal size={15} /> Pricing and system instructions <span>Optional</span></summary><div className="connection-advanced-body"><fieldset><legend>Estimated price per million tokens · USD</legend><p>Optional price overrides, not provider billing data. Leave both blank to use automatic LiteLLM pricing. Unsupported models and local inference need custom prices.</p>{form.models.map((model) => { const price = form.model_prices.find((item) => item.model === model) || { model, input_usd_per_million: '', output_usd_per_million: '' }; const changePrice = (field, value) => setForm((current) => ({ ...current, model_prices: [...current.model_prices.filter((item) => item.model !== model), { ...price, [field]: value }] })); return <div className="admin-grid two" key={model}><label>{model} input<input inputMode="decimal" value={price.input_usd_per_million} onChange={(event) => changePrice('input_usd_per_million', event.target.value)} /></label><label>{model} output<input inputMode="decimal" value={price.output_usd_per_million} onChange={(event) => changePrice('output_usd_per_million', event.target.value)} /></label></div> })}<FieldErrors errors={fieldErrors} field="model_prices" /></fieldset><label>System instructions (admin-managed)<textarea maxLength="12000" placeholder="Instructions applied by the administrator…" value={form.system_prompt} onChange={(event) => setForm({ ...form, system_prompt: event.target.value })} /><FieldErrors errors={fieldErrors} field="system_prompt" /></label></div></details>
          {error && <div className="admin-error" role="alert">{error}</div>}
        </div>
        <div className="integration-editor-footer"><p><ShieldCheck size={14} /> Credentials stay encrypted</p><div><Button type="button" variant="outline" disabled={busy} onClick={closeEditor}>Cancel</Button><Button disabled={busy || discovering || form.models.length === 0 || form.models.length > modelLimit}>{busy && <Loader2 size={14} className="integration-spinner" />}{busy ? 'Saving…' : 'Save integration'}{!busy && <ArrowRight size={14} />}</Button></div></div>
      </form>
    </Modal>}
  </div>
}
