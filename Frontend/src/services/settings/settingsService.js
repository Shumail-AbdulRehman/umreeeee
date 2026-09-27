import { apiRequest } from '../api/client'

export const getSettings = () => apiRequest('/settings')
export const updateSettings = (body) => apiRequest('/settings', { method: 'PUT', body: JSON.stringify(body) })
export const getAudit = (page = 1) => apiRequest(`/audit?page=${page}`)
export const listOrganizations = () => apiRequest('/platform/organizations')
export const setOrganizationStatus = (id, body) => apiRequest(`/platform/organizations/${id}/status`, { method: 'PATCH', body: JSON.stringify(body) })
