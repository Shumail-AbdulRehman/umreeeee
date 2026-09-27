import { apiRequest } from '../api/client'

export async function fetchManagedUsers(query = '') {
  return apiRequest(`/users${query}`)
}

export async function createManagedUser(formData) {
  return apiRequest('/users', {
    method: 'POST',
    body: JSON.stringify(formData),
  })
}

export async function updateManagedUser(userId, formData) {
  return apiRequest(`/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(formData),
  })
}

export async function setManagedUserStatus(userId, isActive, version) {
  return apiRequest(`/users/${userId}/status`, {
    method: 'PATCH', body: JSON.stringify({ is_active: isActive, version }),
  })
}

export async function resendManagedInvitation(userId) {
  return apiRequest(`/users/${userId}/resend-invitation`, { method: 'POST' })
}
