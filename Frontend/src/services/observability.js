import { apiRequest } from './api/client'

export const listViolations = (params = '') => apiRequest(`/violations${params}`)
export const getViolation = (id) => apiRequest(`/violations/${id}`)
export const resolveViolation = (id, body) => apiRequest(`/violations/${id}/resolution`, { method: 'PATCH', body: JSON.stringify(body) })
export const listNotifications = (params = '') => apiRequest(`/notifications${params}`)
export const markNotificationRead = (id) => apiRequest(`/notifications/${id}/read`, { method: 'PATCH' })
export const getSummary = (params = '') => apiRequest(`/analytics/summary${params}`)
export const getSeries = (params = '') => apiRequest(`/analytics/series${params}`)
export const getModels = (params = '') => apiRequest(`/analytics/models${params}`)
