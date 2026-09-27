import { apiRequest } from '../api/client'

export const listPolicies = (params = '') => apiRequest(`/policies${params}`)
export const createPolicy = (body) => apiRequest('/policies', { method: 'POST', body: JSON.stringify(body) })
export const updatePolicy = (id, body) => apiRequest(`/policies/${id}`, { method: 'PUT', body: JSON.stringify(body) })
export const setPolicyStatus = (id, body) => apiRequest(`/policies/${id}/status`, { method: 'PATCH', body: JSON.stringify(body) })
export const getPolicyVersions = (id) => apiRequest(`/policies/${id}/versions`)
export const getPolicyCapabilities = () => apiRequest('/policies/capabilities')
export const testPolicy = (id, body) => apiRequest(`/policies/${id}/test`, { method: 'POST', body: JSON.stringify(body) })
