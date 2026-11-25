import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PlatformCompany from './PlatformCompany'
import { getPlatformCompany, setPlatformCompanyStatus } from './platformService'

vi.mock('./platformService', () => ({ getPlatformCompany: vi.fn(), setPlatformCompanyStatus: vi.fn() }))
const id = '123456789012345678901234'
const now = '2026-11-25T12:00:00Z'
function detail(overrides = {}) {
  return {
    company: { id, name: 'Northstar Labs', slug: 'northstar-labs', status: 'active', version: 2,
      is_own: false, onboarding: 'ready', created_at: now, workspace_runs: 4, open_violations: 1,
      high_severity_violations: 1, ...overrides },
    window: { days: 7, from: '2026-11-19T00:00:00Z', to: now, timezone: 'UTC' }, generated_at: now,
    series: [{ date: now, allowed: 3, blocked: 1, other: 0 }], attention: [],
    metrics: { active_accounts: 8, verified_admins: 1, submitting_users: 2, blocked_runs: 1,
      other_runs: 0, pending_invitations: 2, failed_invitations: 1, active_integrations: 1,
      active_groups: 2, dlp_policies: 1, guardrail_policies: 2, evaluation_coverage: 75,
      policy_coverage: { required: true, eligible_members: 7, covered_members: 5 } },
    history: { items: [], total: 0, page: 1, page_size: 5 },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getPlatformCompany.mockResolvedValue(detail())
})

describe('platform company investigation and access', () => {
  it('shows actual setup, coverage, history link and selected report window', async () => {
    const onMetadata = vi.fn(), onDaysChange = vi.fn()
    render(<PlatformCompany companyId={id} days={30} onDaysChange={onDaysChange} onMetadata={onMetadata} />)
    await screen.findByRole('heading', { name: 'Northstar Labs' })
    expect(getPlatformCompany).toHaveBeenCalledWith(id, { days: 30, signal: expect.any(AbortSignal) })
    expect(screen.getByText('1 DLP · 2 Guardrail')).toBeTruthy()
    expect(screen.getByText('75%')).toBeTruthy()
    expect(screen.getByText(/5 of 7 eligible members/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View audit log' }).getAttribute('href')).toContain(`company_id=${id}`)
    fireEvent.change(screen.getByRole('combobox', { name: 'Reporting period' }), { target: { value: '7' } })
    expect(onDaysChange).toHaveBeenCalledWith(7)
    expect(onMetadata).toHaveBeenCalledWith({ companyName: 'Northstar Labs', generatedAt: now })
  })

  it('protects the operator home company and represents unknown evaluation honestly', async () => {
    const own = detail({ is_own: true })
    own.metrics.evaluation_coverage = null
    getPlatformCompany.mockResolvedValue(own)
    render(<PlatformCompany companyId={id} onDaysChange={vi.fn()} />)
    await screen.findByText('Your organization')
    expect(screen.queryByRole('button', { name: 'Suspend company' })).toBeNull()
    expect(screen.getByText('Unavailable')).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('requires a reason, submits the current version once, and refreshes company and audit state', async () => {
    const updated = detail({ status: 'suspended', version: 3 })
    updated.history.items = [{ id: 'event', company_id: id, company_name: 'Northstar Labs',
      event: 'Company suspended', actor_name: 'Platform owner', created_at: now, request_id: 'request', reason: 'Support request' }]
    getPlatformCompany.mockResolvedValueOnce(detail()).mockResolvedValue(updated)
    setPlatformCompanyStatus.mockResolvedValue({ organization: updated.company })
    render(<PlatformCompany companyId={id} onDaysChange={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Suspend company' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Suspend company' }).disabled).toBe(true)
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Reason' }), { target: { value: '  Support request  ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Suspend company' }))
    await screen.findByRole('button', { name: 'Reactivate company' })
    expect(setPlatformCompanyStatus).toHaveBeenCalledExactlyOnceWith(id, { status: 'suspended', version: 2, reason: 'Support request' })
    expect(screen.getByText('Company suspended')).toBeTruthy()
    expect(screen.getByText('Support request')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('refreshes stale versions while preserving the recorded reason for deliberate confirmation', async () => {
    getPlatformCompany.mockResolvedValueOnce(detail()).mockResolvedValue(detail({ version: 4 }))
    setPlatformCompanyStatus.mockRejectedValue(Object.assign(new Error('Stale'), { code: 'stale_version' }))
    render(<PlatformCompany companyId={id} onDaysChange={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Suspend company' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: 'Investigation' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspend company' }))
    await screen.findByText(/This company changed/)
    await waitFor(() => expect(getPlatformCompany).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('textbox', { name: 'Reason' }).value).toBe('Investigation')
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspend company' }).disabled).toBe(false))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspend company' }))
    await waitFor(() => expect(setPlatformCompanyStatus).toHaveBeenLastCalledWith(id, { status: 'suspended', version: 4, reason: 'Investigation' }))
  })

  it('makes a failed company query recoverable', async () => {
    getPlatformCompany.mockRejectedValueOnce(new Error('Database temporarily unavailable')).mockResolvedValue(detail())
    render(<PlatformCompany companyId={id} onDaysChange={vi.fn()} />)
    await screen.findByText('Database temporarily unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Northstar Labs' })).toBeTruthy()
  })

  it('does not reverse a suspension already applied by another platform owner', async () => {
    getPlatformCompany.mockResolvedValueOnce(detail()).mockResolvedValue(detail({ status: 'suspended', version: 4 }))
    setPlatformCompanyStatus.mockRejectedValue(Object.assign(new Error('Stale'), { code: 'stale_version' }))
    render(<PlatformCompany companyId={id} onDaysChange={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Suspend company' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: 'Pause access' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspend company' }))
    await screen.findByText(/already suspended/)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: 'Reactivate company' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Suspend company' })).toBeNull()
    expect(setPlatformCompanyStatus).toHaveBeenCalledTimes(1)
  })

  it('preserves a reason and blocks confirmation when conflict refresh is unavailable', async () => {
    getPlatformCompany.mockResolvedValueOnce(detail()).mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue(detail({ version: 4 }))
    setPlatformCompanyStatus.mockRejectedValue(Object.assign(new Error('Stale'), { code: 'stale_version' }))
    render(<PlatformCompany companyId={id} onDaysChange={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Suspend company' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: 'Preserved reason' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspend company' }))
    await screen.findByText(/latest company state could not be loaded/)
    expect(screen.getByRole('textbox', { name: 'Reason' }).value).toBe('Preserved reason')
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspend company' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Reload company details' }))
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspend company' }).disabled).toBe(false))
    expect(screen.getByRole('textbox', { name: 'Reason' }).value).toBe('Preserved reason')
  })
})
