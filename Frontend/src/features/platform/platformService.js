import { apiRequest } from '../../services/api/client'

function query(options = {}) {
  const { signal, ...values } = options
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  return { suffix: params.size ? `?${params}` : '', signal }
}

export function getPlatformOverview(options) {
  const { suffix, signal } = query(options)
  return apiRequest(`/platform/overview${suffix}`, { signal })
}

export function listPlatformCompanies(options) {
  const { suffix, signal } = query(options)
  return apiRequest(`/platform/companies${suffix}`, { signal })
}

export function getPlatformCompany(id, options) {
  const { suffix, signal } = query(options)
  return apiRequest(`/platform/companies/${encodeURIComponent(id)}${suffix}`, { signal })
}

export function listPlatformAudit(options) {
  const { suffix, signal } = query(options)
  return apiRequest(`/platform/audit${suffix}`, { signal })
}

export function setPlatformCompanyStatus(id, payload) {
  return apiRequest(`/platform/companies/${encodeURIComponent(id)}/status`, {
    method: 'PATCH', body: JSON.stringify(payload),
  })
}
