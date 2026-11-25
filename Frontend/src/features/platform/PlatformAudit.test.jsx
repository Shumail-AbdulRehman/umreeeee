import { useCallback, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import PlatformAudit from './PlatformAudit'
import { getPlatformCompany, listPlatformAudit, listPlatformCompanies } from './platformService'

vi.mock('./platformService', () => ({ getPlatformCompany: vi.fn(), listPlatformAudit: vi.fn(), listPlatformCompanies: vi.fn() }))

const event = { id: 'event-1', company_id: 'northstar', company_name: 'Northstar Labs',
  action: 'platform.organization_status_changed', event: 'Company suspended', actor_name: 'Platform owner',
  created_at: '2026-11-24T09:46:00Z', request_id: 'request-1042', reason: 'Company requested a temporary pause' }
const response = { items: [event], total: 23, page: 1, page_size: 20 }

function Audit({ initial = '', onChange = () => {} }) {
  const [params, setParams] = useState(() => new URLSearchParams(initial))
  const update = useCallback((patch) => {
    onChange(patch)
    setParams((current) => {
      const next = new URLSearchParams(current)
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === '') next.delete(key)
        else next.set(key, value)
      }
      return next
    })
  }, [onChange])
  return <PlatformAudit params={params} onParamsChange={update} />
}

beforeEach(() => {
  vi.clearAllMocks()
  listPlatformAudit.mockResolvedValue(response)
  listPlatformCompanies.mockResolvedValue({ items: [{ id: 'northstar', name: 'Northstar Labs' }], total: 137, page_size: 8 })
  getPlatformCompany.mockResolvedValue({ company: { id: 'northstar', name: 'Northstar Labs' } })
})

describe('platform audit', () => {
  it('renders safe audit fields and links the affected company', async () => {
    render(<Audit />)
    await screen.findByText('Company suspended')
    expect(screen.getByText('Company requested a temporary pause')).toBeTruthy()
    expect(screen.getByText('request-1042')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Northstar Labs' }).getAttribute('href')).toBe('#platform-company?id=northstar')
    expect(screen.getByText(/Nov 24, 2026.*09:46.*UTC/)).toBeTruthy()
    expect(listPlatformCompanies).not.toHaveBeenCalled()
    expect(listPlatformAudit).toHaveBeenCalledWith(expect.objectContaining({ page: 1, page_size: 20, days: undefined }))
  })

  it('uses a company-specific deep link without silently resetting its filters', async () => {
    render(<Audit initial="company_id=northstar&event_type=integration.updated&days=30&page=2" />)
    await screen.findByText('Company suspended')
    expect(listPlatformAudit).toHaveBeenCalledWith(expect.objectContaining({ company_id: 'northstar', event_type: 'integration.updated', days: 30, page: 2 }))
    expect(screen.getByRole('combobox', { name: 'Event type' }).value).toBe('integration.updated')
    expect(screen.getByRole('combobox', { name: 'Event date' }).value).toBe('30')
    expect(screen.getByText('21–23 of 23 events')).toBeTruthy()
  })

  it('keeps every company reachable through paginated searchable choices', async () => {
    const changed = vi.fn()
    render(<Audit onChange={changed} />)
    await screen.findByText('Company suspended')
    const summary = screen.getByText('All companies', { selector: 'summary' })
    const picker = summary.parentElement
    picker.open = true
    fireEvent(picker, new Event('toggle'))
    await screen.findByRole('list', { name: 'Company choices' })
    expect(listPlatformCompanies.mock.calls.at(-1)[0]).toMatchObject({ page: 1, page_size: 8, sort: 'name' })
    fireEvent.click(screen.getByRole('button', { name: 'Next companies' }))
    await waitFor(() => expect(listPlatformCompanies.mock.calls.at(-1)[0].page).toBe(2))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a company' }), { target: { value: 'Northstar' } })
    await waitFor(() => expect(listPlatformCompanies.mock.calls.at(-1)[0]).toMatchObject({ page: 1, q: 'Northstar' }))
    const currentChoices = await screen.findByRole('list', { name: 'Company choices' })
    fireEvent.click(within(currentChoices).getByRole('button', { name: 'Northstar Labs' }))
    expect(changed).toHaveBeenCalledWith({ company_id: 'northstar', page: null })
    expect(picker.open).toBe(false)
    expect(document.activeElement).toBe(summary)
  })

  it('dismisses the company picker with Escape and returns focus to its trigger', async () => {
    render(<Audit />)
    await screen.findByText('Company suspended')
    const summary = screen.getByText('All companies', { selector: 'summary' })
    const picker = summary.parentElement
    picker.open = true
    fireEvent(picker, new Event('toggle'))
    const search = await screen.findByRole('searchbox', { name: 'Find a company' })
    search.focus()
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(picker.open).toBe(false)
    expect(document.activeElement).toBe(summary)
  })

  it('filters events and dates on the server and resets the current page', async () => {
    render(<Audit initial="company_id=northstar&page=2" />)
    await screen.findByText('Company suspended')
    fireEvent.change(screen.getByRole('combobox', { name: 'Event type' }), { target: { value: 'policy_set.updated' } })
    await waitFor(() => expect(listPlatformAudit.mock.calls.at(-1)[0]).toMatchObject({ event_type: 'policy_set.updated', company_id: 'northstar', page: 1 }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Event date' }), { target: { value: '7' } })
    await waitFor(() => expect(listPlatformAudit.mock.calls.at(-1)[0]).toMatchObject({ days: 7, event_type: 'policy_set.updated' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(listPlatformAudit.mock.calls.at(-1)[0].page).toBe(2))
  })

  it('keeps the selected company name when it has no matching audit events and clears filters', async () => {
    listPlatformAudit.mockResolvedValue({ items: [], total: 0, page_size: 20 })
    render(<Audit initial="company_id=northstar&days=30" />)
    await screen.findByRole('heading', { name: 'No matching events' })
    await screen.findByText('Northstar Labs', { selector: 'summary' })
    expect(getPlatformCompany).toHaveBeenCalledWith('northstar', expect.objectContaining({ days: 7 }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(listPlatformAudit.mock.calls.at(-1)[0]).toMatchObject({ company_id: '', event_type: '', days: undefined, page: 1 }))
  })

  it('recovers an audit failure without loading a private tenant audit route', async () => {
    listPlatformAudit.mockRejectedValueOnce(new Error('Audit reporting unavailable'))
    render(<Audit />)
    await screen.findByText('Audit reporting unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('Company suspended')
    expect(listPlatformAudit).toHaveBeenCalledTimes(2)
    expect(listPlatformCompanies).not.toHaveBeenCalled()
  })
})
