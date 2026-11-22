import { apiRequest, getAuthToken } from '../api/client'
import { beginTrackedRequest } from '../api/requestActivity'

const root = '/red-team'
// Mirrors the normalisation in services/api/client.js (which does not export it).
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').trim().replace(/\/+$/, '')
const RESULT_FILTERS = ['plugin', 'strategy', 'verdict', 'verdict_source', 'case_kind', 'state', 'page']

// Accepts a legacy string ('?a=b', 'a=b', '') or an object; empty values are dropped.
export function buildQuery(input = '') {
  if (typeof input === 'string') return input
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(input || {})) {
    if (value === undefined || value === null || value === '') continue
    query.set(key, String(value))
  }
  const text = query.toString()
  return text ? `?${text}` : ''
}
export const buildResultsQuery = (filters = {}) => buildQuery(
  Object.fromEntries(RESULT_FILTERS.map((key) => [key, filters?.[key]])),
)
export const redTeamCapabilities = () => apiRequest(`${root}/capabilities`)
export const listRedTeamTests = (params = '') => apiRequest(`${root}/tests${buildQuery(params)}`)
export const createRedTeamTest = (body) => apiRequest(`${root}/tests`, { method: 'POST', body: JSON.stringify(body) })
export const getRedTeamTest = (id) => apiRequest(`${root}/tests/${id}`)
export const updateRedTeamTest = (id, body) => apiRequest(`${root}/tests/${id}`, { method: 'PUT', body: JSON.stringify(body) })
export const launchRedTeamTest = (id, version, key) => apiRequest(`${root}/tests/${id}/launch`, {
  method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ version }),
})
export const cancelRedTeamTest = (id) => apiRequest(`${root}/tests/${id}/cancel`, { method: 'POST' })
export const cloneRedTeamTest = (id, mode) => apiRequest(`${root}/tests/${id}/clone`, {
  method: 'POST', body: JSON.stringify({ mode }),
})
export const listRedTeamResults = (id, params = '') => apiRequest(`${root}/tests/${id}/results${typeof params === 'string' ? params : buildResultsQuery(params)}`)
export const getRedTeamResult = (id, jobId) => apiRequest(`${root}/tests/${id}/results/${jobId}`)
export const getRedTeamReport = (id) => apiRequest(`${root}/tests/${id}/report`)
export const compareRedTeamTests = (rawId, protectedId) => apiRequest(`${root}/comparisons?${new URLSearchParams({ raw_test_id: rawId, protected_test_id: protectedId })}`)

export async function downloadRedTeamExport(id, format) {
  const finish = beginTrackedRequest()
  try {
    const token = getAuthToken()
    const response = await fetch(`${API_BASE_URL}${root}/tests/${id}/export?${new URLSearchParams({ format })}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.detail?.message || `Export failed (${response.status})`)
    }
    const blob = await response.blob()
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `red-team-${id}.${format}`
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  } finally { finish() }
}
