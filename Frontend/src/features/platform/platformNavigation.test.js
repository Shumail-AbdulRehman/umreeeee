import { describe, expect, it } from 'vitest'
import { defaultPageForUser, isPlatformRoute, mergePlatformParams, platformDays, platformHash } from './platformNavigation'

describe('platform navigation', () => {
  it('assigns separate platform and tenant landing pages', () => {
    expect(defaultPageForUser({ role: 'super_admin' })).toBe('platform-overview')
    expect(defaultPageForUser({ role: 'org_admin' })).toBe('insights')
    expect(defaultPageForUser({ role: 'user' })).toBe('my-activity')
    expect(isPlatformRoute('platform-company')).toBe(true)
    expect(isPlatformRoute('insights')).toBe(false)
  })

  it('merges filters without dropping date range and safely encodes search', () => {
    const original = new URLSearchParams('days=30&page=3&access=active')
    const next = mergePlatformParams(original, { page: null, q: 'A & B' })
    expect(platformHash('platform-companies', next)).toBe('platform-companies?days=30&access=active&q=A+%26+B')
    expect(original.get('page')).toBe('3')
    expect(platformDays(next)).toBe(30)
    expect(platformDays(new URLSearchParams('days=999'))).toBe(7)
  })
})
