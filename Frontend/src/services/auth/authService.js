import { apiRequest, clearAuthToken, setAuthToken } from '../api/client'

const PENDING_VERIFICATION_STORAGE_KEY = 'centurion.auth.pending-verification'

function isAuthenticatedPayload(payload) {
  return Boolean(payload?.access_token)
}

function normalizePendingVerificationState(state) {
  return {
    email: state?.email || '',
    message: state?.message || '',
  }
}

function storeSession(payload) {
  setAuthToken(payload.access_token)
  clearPendingVerificationState()
  return payload.user
}

export async function signupUser(formData) {
  return apiRequest('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(formData),
  })
}

export async function loginUser(formData) {
  const payload = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(formData),
  })

  if (isAuthenticatedPayload(payload)) {
    return storeSession(payload)
  }

  return payload
}

export async function verifyEmailCode(formData) {
  const payload = await apiRequest('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify(formData),
  })

  return storeSession(payload)
}

export async function resendVerificationCode(formData) {
  return apiRequest('/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify(formData),
  })
}

export async function requestPasswordReset(formData) {
  return apiRequest('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify(formData),
  })
}

export async function resetPassword(formData) {
  return apiRequest('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(formData),
  })
}

export async function fetchInvitationDetails(token) {
  const params = new URLSearchParams({ token })
  return apiRequest(`/auth/invitation?${params.toString()}`, {
    token: '',
  })
}

export async function acceptInvitation(formData) {
  return apiRequest('/auth/accept-invitation', {
    method: 'POST',
    body: JSON.stringify(formData),
    token: '',
  })
}

export async function fetchCurrentUser() {
  return apiRequest('/auth/me')
}

export function getPendingVerificationState() {
  const rawState = window.sessionStorage.getItem(PENDING_VERIFICATION_STORAGE_KEY)
  if (!rawState) {
    return normalizePendingVerificationState()
  }

  try {
    return normalizePendingVerificationState(JSON.parse(rawState))
  } catch {
    clearPendingVerificationState()
    return normalizePendingVerificationState()
  }
}

export function setPendingVerificationState(state) {
  const nextState = normalizePendingVerificationState(state)
  if (nextState.email) {
    window.sessionStorage.setItem(
      PENDING_VERIFICATION_STORAGE_KEY,
      JSON.stringify(nextState),
    )
    return
  }

  window.sessionStorage.removeItem(PENDING_VERIFICATION_STORAGE_KEY)
}

export function clearPendingVerificationState() {
  window.sessionStorage.removeItem(PENDING_VERIFICATION_STORAGE_KEY)
}

export function logoutUser() {
  clearAuthToken()
  clearPendingVerificationState()
}
