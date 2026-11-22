import { ApiError, apiRequest } from '../api/client'

const unavailableMessage = 'Chat history is unavailable on this server. Ask your administrator to update the backend, then retry.'

async function conversationRequest(path, detail = false) {
  try {
    const result = await apiRequest(path)
    if (!Array.isArray(result?.items) || !Number.isInteger(result.total) ||
        !Number.isInteger(result.page_size) || result.page_size < 1 ||
        (detail && !result.conversation?.id)) {
      throw new ApiError({ status: 502, code: 'conversation_api_unavailable', message: unavailableMessage })
    }
    return result
  } catch (problem) {
    // A resource-level 404 has our structured not_found code. A missing route
    // returns FastAPI's plain Not Found response instead.
    if (problem.status === 405 || (problem.status === 404 && (!detail || problem.code !== 'not_found'))) {
      throw new ApiError({ status: problem.status, code: 'conversation_api_unavailable', message: unavailableMessage })
    }
    throw problem
  }
}

export async function fetchPromptWorkspaceContext() {
  return apiRequest('/prompt-workspace/context')
}

export const fetchPromptWorkspaceRuns = (page = 1, status = '') => apiRequest(`/prompt-workspace/runs?${new URLSearchParams({ page: String(page), status })}`)
export const fetchPromptWorkspaceRun = (id) => apiRequest(`/prompt-workspace/runs/${id}`)
export const fetchConversations = (page = 1) => conversationRequest(`/prompt-workspace/conversations?page=${page}`)
export const fetchConversation = (id, page = 1) => conversationRequest(`/prompt-workspace/conversations/${id}?page=${page}`, true)

export async function executePromptWorkspaceRun(formData, key) {
  return apiRequest('/prompt-workspace/run', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify(formData),
  })
}
