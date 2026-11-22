import { beginTrackedRequest } from './requestActivity'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').trim().replace(/\/+$/, '')
const TOKEN_STORAGE_KEY = 'centurion.auth.token'

export class ApiError extends Error {
  constructor({ status, code, message, fieldErrors = {}, requestId = null, run = null }) {
    super(message)
    this.name = 'ApiError'
    Object.assign(this, { status, code, fieldErrors, requestId, run })
  }
}

async function parseResponse(response, protectedRequest) {
  const contentType = response.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')
  const body = isJson ? await response.json() : await response.text()

  if (!response.ok) {
    const detail = body?.detail
    const fieldErrors = Array.isArray(detail)
      ? detail.reduce((fields, item) => {
        const field = (item.loc || []).filter((part) => part !== 'body').join('.') || 'request'
        fields[field] = [...(fields[field] || []), item.msg || 'Invalid value']
        return fields
      }, {})
      : detail?.field_errors || {}
    const message = typeof detail === 'string' ? detail : detail?.message || body?.message || `Request failed (${response.status})`
    if (response.status === 401 && protectedRequest) {
      clearAuthToken()
      window.dispatchEvent(new Event('sentinel:session-expired'))
    }
    throw new ApiError({ status: response.status, code: detail?.code || 'request_error', message,
      fieldErrors, requestId: detail?.request_id || null, run: body?.run || null })
  }

  return body
}

export function getAuthToken() {
  return window.localStorage.getItem(TOKEN_STORAGE_KEY)
}

export function setAuthToken(token) {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token)
}

export function clearAuthToken() {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY)
}

export async function apiRequest(path, options = {}) {
  const { token: suppliedToken, headers: suppliedHeaders, silent = false, ...fetchOptions } = options
  const token = suppliedToken ?? getAuthToken()
  const finish = silent || path.startsWith('/notifications') ? null : beginTrackedRequest()
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(suppliedHeaders || {}),
      },
    })
    return await parseResponse(response, Boolean(token) && !path.startsWith('/auth/login'))
  } finally {
    finish?.()
  }
}
