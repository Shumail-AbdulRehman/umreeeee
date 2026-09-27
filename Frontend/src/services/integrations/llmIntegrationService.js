import { apiRequest } from '../api/client'

export async function fetchLLMIntegrations() {
  const payload = await apiRequest('/integrations?page_size=100')
  return payload.items || []
}

export async function fetchLLMIntegrationPage(page = 1) {
  return apiRequest(`/integrations?page=${page}`)
}

export async function fetchAvailableLLMModels(formData) {
  return apiRequest('/integrations/available-models', {
    method: 'POST',
    body: JSON.stringify(formData),
  })
}

export async function createLLMIntegration(formData) {
  return apiRequest('/integrations', {
    method: 'POST',
    body: JSON.stringify(formData),
  })
}

export async function updateLLMIntegration(integrationId, formData) {
  return apiRequest(`/integrations/${integrationId}`, {
    method: 'PUT',
    body: JSON.stringify(formData),
  })
}

export async function fetchStoredModels(integrationId) {
  return apiRequest(`/integrations/${integrationId}/available-models`, { method: 'POST' })
}

export async function setIntegrationStatus(integrationId, status, version) {
  return apiRequest(`/integrations/${integrationId}/status`, {
    method: 'PATCH', body: JSON.stringify({ status, version }),
  })
}
