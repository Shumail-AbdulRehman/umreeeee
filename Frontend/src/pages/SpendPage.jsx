import { useEffect, useState } from 'react'
import { getSummary } from '../services/observability'

export default function SpendPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { getSummary().then(setData).catch((problem) => setError(problem.message)) }, [])
  return <div className="admin-stack">{error && <div className="admin-error" role="alert">{error}</div>}<section className="admin-panel"><h2>Estimated spend · last seven days</h2><p>Estimates use reported provider tokens with automatic LiteLLM pricing or your configured price overrides. This is not a billing statement.</p><p className="overview-measures">${data?.estimated_cost_usd ?? '—'} USD</p><p>{data?.unknown_cost_runs ?? '—'} runs have unknown or partial cost · {data?.unknown_usage_runs ?? '—'} runs have unknown token usage.</p><p>Set custom per-model prices in Integrations when needed. Changes apply to future runs; unsupported models remain unknown.</p></section></div>
}
