import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '../../services/api/client'
import { getPlatformOverview, listPlatformCompanies, getPlatformCompany, listPlatformAudit, setPlatformCompanyStatus } from './platformService'

vi.mock('../../services/api/client', () => ({ apiRequest: vi.fn() }))
beforeEach(() => vi.clearAllMocks())

describe('platform API client', () => {
  it('encodes directory filters without putting the abort signal in the URL', async () => {
    const signal = new AbortController().signal
    await listPlatformCompanies({ q: 'A & B', access: '', page: 2, days: 30, signal })
    expect(apiRequest).toHaveBeenCalledWith('/platform/companies?q=A+%26+B&page=2&days=30', { signal })
  })

  it('uses separate protected endpoints and encoded company IDs', async () => {
    await getPlatformOverview({ days: 7 })
    await getPlatformCompany('company/other', { days: 30 })
    await listPlatformAudit({ company_id: 'selected', event_type: 'auth.signup', page: 1 })
    expect(apiRequest.mock.calls.map(([path]) => path)).toEqual([
      '/platform/overview?days=7', '/platform/companies/company%2Fother?days=30',
      '/platform/audit?company_id=selected&event_type=auth.signup&page=1',
    ])
  })

  it('sends the version and reason with access mutations and preserves API errors', async () => {
    const payload = { status: 'suspended', version: 3, reason: 'Support request' }
    const conflict = Object.assign(new Error('Refresh required'), { code: 'stale_version' })
    apiRequest.mockRejectedValueOnce(conflict)
    await expect(setPlatformCompanyStatus('company', payload)).rejects.toBe(conflict)
    expect(apiRequest).toHaveBeenCalledWith('/platform/companies/company/status', {
      method: 'PATCH', body: JSON.stringify(payload),
    })
  })
})
