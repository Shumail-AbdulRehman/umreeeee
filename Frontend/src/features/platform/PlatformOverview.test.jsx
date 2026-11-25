import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import PlatformOverview from './PlatformOverview'
import { getPlatformOverview } from './platformService'

vi.mock('./platformService', () => ({ getPlatformOverview: vi.fn() }))

function result() {
  return { generated_at: '2026-11-25T12:00:00Z', window: { days: 7, from: '2026-11-19T00:00:00Z', to: '2026-11-25T12:00:00Z', timezone: 'UTC' }, metrics: { total_companies: 12, using_companies: 8, onboarding_companies: 4, suspended_companies: 1 }, series: [{ date: '2026-11-25T00:00:00Z', allowed: 9, blocked: 2, other: 1 }], attention: { items: [], total: 0 }, companies: [{ id: 'company-a', name: 'Example Company', slug: 'example-company', status: 'active', onboarding: 'ready', workspace_runs: 12, last_workspace_submission: null, open_violations: 0, series: [] }] }
}

beforeEach(() => vi.clearAllMocks())

describe('PlatformOverview', () => {
  it('loads real API metrics, attention and company activity', async () => {
    getPlatformOverview.mockResolvedValue(result())
    const metadata = vi.fn()
    render(<PlatformOverview days={7} onDaysChange={() => {}} onMetadata={metadata} />)
    expect(screen.getByRole('status').textContent).toContain('Loading platform overview')
    await screen.findByText('Example Company')
    expect(getPlatformOverview).toHaveBeenCalledWith({ days: 7, signal: expect.any(AbortSignal) })
    expect(metadata).toHaveBeenCalledWith({ generatedAt: '2026-11-25T12:00:00Z' })
    expect(screen.getByRole('heading', { name: 'Companies using Averiq' })).toBeTruthy()
    expect(screen.getByText('8')).toBeTruthy()
    expect(screen.getByText('No current issues')).toBeTruthy()
    expect(screen.getByRole('link', { name: /View all companies/ }).getAttribute('href')).toBe('#platform-companies')
  })

  it('changes the reporting window through the controlled action', async () => {
    getPlatformOverview.mockResolvedValue(result())
    const change = vi.fn()
    const { rerender } = render(<PlatformOverview days={7} onDaysChange={change} />)
    await screen.findByText('Example Company')
    fireEvent.change(screen.getByLabelText('Reporting period'), { target: { value: '30' } })
    expect(change).toHaveBeenCalledWith(30)
    rerender(<PlatformOverview days={30} onDaysChange={change} />)
    await waitFor(() => expect(getPlatformOverview).toHaveBeenCalledWith({ days: 30, signal: expect.any(AbortSignal) }))
    await screen.findByText('Submitted in the last 30 days')
  })

  it('offers recovery after a failed request', async () => {
    getPlatformOverview.mockRejectedValueOnce(new Error('Service unavailable')).mockResolvedValueOnce(result())
    render(<PlatformOverview days={7} onDaysChange={() => {}} />)
    await screen.findByText('Service unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('Example Company')
    expect(getPlatformOverview).toHaveBeenCalledTimes(2)
  })

  it('does not invent companies or activity for an empty platform', async () => {
    getPlatformOverview.mockResolvedValue({ ...result(), metrics: { total_companies: 0, using_companies: 0, onboarding_companies: 0, suspended_companies: 0 }, companies: [], series: [] })
    render(<PlatformOverview days={7} onDaysChange={() => {}} />)
    await screen.findByText('No companies yet')
    expect(screen.getByText('No workspace submissions in this period.')).toBeTruthy()
    expect(screen.queryByText('Example Company')).toBeNull()
  })
})
