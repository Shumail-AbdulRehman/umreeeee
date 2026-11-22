import { useEffect, useState } from 'react'
import { Bot, Plug, Search } from 'lucide-react'
import { fetchLLMIntegrations } from '../services/integrations/llmIntegrationService'
import { getModels } from '../services/observability'
import DataTable from '../components/DataTable'
import { SearchInput, StatCard } from '../components/Surface'
import { formatNumber } from '../lib/format'
export default function CatalogPage() {
  const [integrations, setIntegrations] = useState([])
  const [usage, setUsage] = useState([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { Promise.all([fetchLLMIntegrations(), getModels()]).then(([items, models]) => { setIntegrations(items); setUsage(models.items) }).catch((problem) => setError(problem.message)) }, [])
  const active = integrations.filter((item) => item.status === 'active')
  const rows = active.flatMap((item) => item.models.map((model) => ({ id: `${item.id}-${model}`, provider: item.provider, account: item.account_name, model, runs: usage.find((row) => row.provider === item.provider && row.model === model)?.runs ?? 0 })))
  const visible = rows.filter((row) => `${row.provider} ${row.account} ${row.model}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="admin-stack">{error && <div className="admin-error" role="alert">{error}</div>}<section className="report-stat-grid"><StatCard title="Configured models" value={formatNumber(new Set(rows.map((row) => `${row.provider}:${row.model}`)).size)} description="Distinct models across active integrations" icon={Bot} /><StatCard title="Active integrations" value={formatNumber(active.length)} description="Organization-configured provider accounts" icon={Plug} /><StatCard title="Models with observed use" value={formatNumber(new Set(rows.filter((row) => row.runs > 0).map((row) => `${row.provider}:${row.model}`)).size)} description="At least one recorded run in the last seven days" icon={Search} /></section><DataTable title="Model directory" description="Usage counts are per provider/model across integrations. Configuration does not imply provider health." rows={visible} toolbar={<SearchInput label="Search models" placeholder="Search model, provider, or integration…" value={query} onChange={(event) => setQuery(event.target.value)} />} emptyTitle={query ? 'No matching models' : 'No active models configured'} emptyDescription={query ? 'Try a different model or provider name.' : 'An administrator can connect a provider and enable models in Integrations.'} columns={[{ id: 'model', label: 'Model', value: (row) => row.model, render: (row) => <div className="person-cell"><span className="person-monogram"><Bot size={17} /></span><strong>{row.model}</strong></div> }, { id: 'provider', label: 'Provider', value: (row) => row.provider, className: 'capitalize' }, { id: 'integration', label: 'Integration', value: (row) => row.account }, { id: 'runs', label: 'Recorded runs · 7 days', value: (row) => row.runs, render: (row) => formatNumber(row.runs) }]} /></div>
}
