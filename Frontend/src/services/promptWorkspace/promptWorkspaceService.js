import { apiRequest } from '../api/client'

export async function fetchPromptWorkspaceContext() {
  return apiRequest('/prompt-workspace/context')
}

export const fetchPromptWorkspaceRuns = (page = 1, status = '') => apiRequest(`/prompt-workspace/runs?${new URLSearchParams({ page: String(page), status })}`)
export const fetchPromptWorkspaceRun = (id) => apiRequest(`/prompt-workspace/runs/${id}`)

export async function executePromptWorkspaceRun(formData, key) {
  return apiRequest('/prompt-workspace/run', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify(formData),
  })
}
