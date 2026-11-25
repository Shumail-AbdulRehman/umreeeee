import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import PlatformShell from './PlatformShell'
import { AccessBadge, AttentionPanel, AuditTable, CompanyTable, MetricStrip, Pagination, PeriodControl, WorkspaceChart } from './PlatformComponents'

const company = { id: 'safe-id', name: 'Example Company', slug: 'example-company', status: 'active', onboarding: 'ready', workspace_runs: 9, last_workspace_submission: '2026-11-24T12:00:00Z', open_violations: 2, series: [{ date: '2026-11-24T00:00:00Z', allowed: 6, blocked: 2, other: 1 }] }

describe('platform shared presentation', () => {
  it('shows real table values, labels and company-scoped links', () => {
    render(<CompanyTable items={[company]} />)
    expect(screen.getByRole('link', { name: /Example Company/ }).getAttribute('href')).toBe('#platform-company?id=safe-id')
    expect(screen.getByText('Active')).toBeTruthy()
    expect(screen.getByText('Ready')).toBeTruthy()
    expect(screen.getByText('9')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Company results' }).getAttribute('tabindex')).toBe('0')
  })

  it('provides exact accessible chart data and separates other outcomes', () => {
    const { container } = render(<WorkspaceChart series={company.series} window={{ from: '2026-11-18T00:00:00Z', to: '2026-11-25T12:00:00Z' }} />)
    const table = screen.getByRole('table', { hidden: true })
    expect(within(table).getByText('6')).toBeTruthy()
    expect(within(table).getByText('2')).toBeTruthy()
    expect(within(table).getByText('1')).toBeTruthy()
    expect(container.querySelector('.bar-slot').title).toContain('Other outcomes 1')
    expect(screen.getByText('Chart data')).toBeTruthy()
    expect(screen.getByText(/prompt submissions/)).toBeTruthy()
  })

  it('groups a monthly chart without dropping daily values from accessible data', () => {
    const series = Array.from({ length: 30 }, (_, index) => ({ date: new Date(Date.UTC(2026, 10, index + 1)).toISOString(), allowed: 2, blocked: 1, other: 0 }))
    const { container } = render(<WorkspaceChart series={series} />)
    expect(container.querySelectorAll('.bar-slot')).toHaveLength(10)
    expect(container.querySelectorAll('.chart-table tbody tr')).toHaveLength(30)
    expect(container.querySelector('.bar-slot').title).toContain('9 submissions')
    expect(screen.getByText('90')).toBeTruthy()
  })

  it('represents zero activity honestly without invented bars', () => {
    const { container } = render(<WorkspaceChart series={[{ date: '2026-11-24T00:00:00Z', allowed: 0, blocked: 0, other: 0 }]} />)
    expect(screen.getByText('No workspace submissions in this period.')).toBeTruthy()
    expect(container.querySelector('.bar-slot')).toBeNull()
  })

  it('offers reporting windows and only enabled pagination actions', () => {
    const select = vi.fn()
    const paginate = vi.fn()
    render(<><PeriodControl days={7} onChange={select} /><Pagination page={1} pageSize={8} total={12} onPageChange={paginate} /></>)
    fireEvent.change(screen.getByLabelText('Reporting period'), { target: { value: '30' } })
    expect(select).toHaveBeenCalledWith(30)
    expect(screen.getByRole('button', { name: 'Previous' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(paginate).toHaveBeenCalledWith(2)
    expect(screen.getByText('1–8 of 12 companies')).toBeTruthy()
  })

  it('renders only public audit fields and preserves UTC context', () => {
    render(<AuditTable items={[{ id: 'a1', company_id: 'safe-id', company_name: 'Example Company', event: 'Company suspended', actor_name: 'Platform owner', created_at: '2026-11-25T11:20:00Z', request_id: 'req-123', reason: 'Requested pause', before: { private: 'must not render' } }]} />)
    expect(screen.getByText('Requested pause')).toBeTruthy()
    expect(screen.getByText('req-123')).toBeTruthy()
    expect(screen.getByText(/11:20 · UTC/)).toBeTruthy()
    expect(screen.queryByText('must not render')).toBeNull()
  })

  it('keeps current issue counts distinct from preview length', () => {
    render(<AttentionPanel total={9} items={[{ id: 'issue', company_id: 'safe-id', company_name: 'Example Company', title: 'No active integration', description: 'Setup is incomplete.', tone: 'blue', kind: 'no_integration' }]} />)
    expect(screen.getByText('9 open')).toBeTruthy()
    expect(screen.getByRole('link', { name: /No active integration/ }).getAttribute('href')).toBe('#platform-company?id=safe-id')
  })

  it('gives empty attention a calm and truthful state', () => {
    render(<AttentionPanel />)
    expect(screen.getByText('0 open')).toBeTruthy()
    expect(screen.getByText('No current issues')).toBeTruthy()
  })

  it('keeps count metrics and access state readable', () => {
    render(<><MetricStrip items={[{ label: 'Total companies', value: 12, description: 'All registered companies' }]} /><AccessBadge status="suspended" /></>)
    expect(screen.getByRole('heading', { name: 'Total companies' })).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('Suspended')).toBeTruthy()
  })
})

describe('platform shell', () => {
  it('has a separate global scope, real account and workspace return', () => {
    const logout = vi.fn()
    render(<PlatformShell user={{ first_name: 'Ava', last_name: 'Owner' }} route="platform-company" companyName="Example Company" onLogout={logout}><h1>Company detail</h1></PlatformShell>)
    expect(screen.getByText('Cross-company view')).toBeTruthy()
    expect(screen.getByText('Ava Owner')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Your organization' }).getAttribute('href')).toBe('#insights')
    expect(screen.getAllByRole('link', { name: 'Companies' })[0].getAttribute('aria-current')).toBe('page')
    expect(screen.queryByText('Sample data')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(logout).toHaveBeenCalledOnce()
  })

  it('opens keyboard navigation and returns focus on Escape', () => {
    const { container } = render(<PlatformShell user={{ first_name: 'Ava' }} onLogout={() => {}}><h1>Overview</h1></PlatformShell>)
    const button = screen.getByRole('button', { name: 'Open navigation' })
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Overview' }))
    fireEvent.keyDown(container.querySelector('.sidebar'), { key: 'Escape' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(button)
  })
})
