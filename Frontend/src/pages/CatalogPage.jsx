import { useEffect, useState } from 'react'
import { fetchLLMIntegrations } from '../services/integrations/llmIntegrationService'
import { getModels } from '../services/observability'

export default function CatalogPage() {
  const [integrations, setIntegrations] = useState([])
  const [usage, setUsage] = useState([])
  const [error, setError] = useState('')
  useEffect(() => { Promise.all([fetchLLMIntegrations(), getModels()]).then(([items, models]) => { setIntegrations(items); setUsage(models.items) }).catch((problem) => setError(problem.message)) }, [])
  return <div className="admin-stack">{error && <div className="admin-error" role="alert">{error}</div>}<section className="admin-panel"><h2>Configured models</h2><p>Usage is from the last seven days. No provider health check is implied.</p><div className="admin-scroll"><table className="admin-table"><thead><tr><th>Provider</th><th>Integration</th><th>Model</th><th>Runs</th></tr></thead><tbody>{integrations.filter((item) => item.status === 'active').flatMap((item) => item.models.map((model) => { const observed = usage.find((row) => row.provider === item.provider && row.model === model); return <tr key={`${item.id}-${model}`}><td>{item.provider}</td><td>{item.account_name}</td><td>{model}</td><td>{observed?.runs ?? 0}</td></tr> }))}</tbody></table></div>{integrations.length === 0 && <p>No active integrations.</p>}</section></div>
}
