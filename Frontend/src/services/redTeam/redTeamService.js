import { apiRequest, getAuthToken } from '../api/client'

const root = '/red-team'
export const redTeamCapabilities = () => apiRequest(`${root}/capabilities`)
export const listRedTeamTests = (params = '') => apiRequest(`${root}/tests${params}`)
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
export const listRedTeamResults = (id, params = '') => apiRequest(`${root}/tests/${id}/results${params}`)
export const getRedTeamResult = (id, jobId) => apiRequest(`${root}/tests/${id}/results/${jobId}`)
export const getRedTeamReport = (id) => apiRequest(`${root}/tests/${id}/report`)
export const compareRedTeamTests = (rawId, protectedId) => apiRequest(`${root}/comparisons?${new URLSearchParams({ raw_test_id: rawId, protected_test_id: protectedId })}`)

export async function downloadRedTeamExport(id, format) {
  const token = getAuthToken()
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || '/api'}${root}/tests/${id}/export?format=${format}`, {
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
}
