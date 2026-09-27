import { apiRequest } from '../api/client'

export const listGroups = (params = '') => apiRequest(`/groups${params}`)
export const listMyGroups = () => apiRequest('/groups/mine')
export const createGroup = (body) => apiRequest('/groups', { method: 'POST', body: JSON.stringify(body) })
export const updateGroup = (id, body) => apiRequest(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(body) })
export const setGroupStatus = (id, body) => apiRequest(`/groups/${id}/status`, { method: 'PATCH', body: JSON.stringify(body) })
