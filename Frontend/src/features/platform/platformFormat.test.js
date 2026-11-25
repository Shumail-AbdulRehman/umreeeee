import { describe, expect, it, vi } from 'vitest'
import { formatDate } from './platformFormat'

describe('platform UTC formatting', () => {
  it('retains explicit UTC context instead of the viewer timezone', () => {
    expect(formatDate('2026-11-25T11:20:00Z')).toContain('11:20 · UTC')
    expect(formatDate('2026-11-25T00:00:00Z', { dateOnly: true })).toBe('Nov 25, 2026')
    expect(formatDate(null)).toBe('—')
    expect(formatDate('invalid')).toBe('—')
  })
  it('makes recent submissions readable without changing their precise timestamp', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-25T12:00:00Z'))
    expect(formatDate('2026-11-25T11:42:00Z', { relative: true })).toBe('18 min ago')
    expect(formatDate('2026-11-25T11:59:59Z', { relative: true })).toBe('Just now')
    vi.restoreAllMocks()
  })
})
