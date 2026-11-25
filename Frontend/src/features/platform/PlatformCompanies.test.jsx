import { useCallback, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import PlatformCompanies from './PlatformCompanies'
import { listPlatformCompanies } from './platformService'

vi.mock('./platformService', () => ({ listPlatformCompanies: vi.fn() }))

const company = { id: 'northstar', name: 'Northstar Labs', slug: 'northstar-labs', status: 'active',
  onboarding: 'ready', workspace_runs: 21, open_violations: 2, last_workspace_submission: null, series: [] }
const response = { items: [company], total: 17, page: 1, page_size: 8 }

function Directory({ initial = '', onChange = () => {} }) {
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
  return <PlatformCompanies days={Number(params.get('days') || 7)} params={params} onParamsChange={update}
    onDaysChange={(days) => update({ days: String(days), page: null })} />
}

beforeEach(() => { vi.clearAllMocks(); listPlatformCompanies.mockResolvedValue(response) })

describe('platform company directory', () => {
  it('loads the full server query and links a company to its platform detail', async () => {
    render(<Directory initial="days=30&page=2&q=Labs&access=active&onboarding=ready&activity=used&sort=violations" />)
    const link = await screen.findByRole('link', { name: /Northstar Labs/ })
    expect(link.getAttribute('href')).toBe('#platform-company?id=northstar')
    expect(listPlatformCompanies).toHaveBeenCalledWith(expect.objectContaining({ days: 30, page: 2, page_size: 8,
      q: 'Labs', access: 'active', onboarding: 'ready', activity: 'used', sort: 'violations' }))
    expect(screen.getByRole('searchbox', { name: 'Search companies' }).value).toBe('Labs')
    expect(screen.getByText('9–16 of 17 companies')).toBeTruthy()
  })

  it('debounces searching without replacing the focused input and resets the server page', async () => {
    const changed = vi.fn()
    render(<Directory initial="page=2&access=active" onChange={changed} />)
    const input = screen.getByRole('searchbox', { name: 'Search companies' })
    await screen.findByRole('link', { name: /Northstar Labs/ })
    input.focus()
    fireEvent.change(input, { target: { value: 'North' } })
    fireEvent.change(input, { target: { value: 'Northstar' } })
    expect(changed).not.toHaveBeenCalled()
    await waitFor(() => expect(changed).toHaveBeenCalledWith({ q: 'Northstar', page: null }))
    expect(listPlatformCompanies.mock.calls.at(-1)[0]).toMatchObject({ q: 'Northstar', page: 1, access: 'active' })
    expect(document.activeElement).toBe(input)
    expect(screen.getByRole('searchbox', { name: 'Search companies' })).toBe(input)
  })

  it('filters and sorts on the server while keeping the selected reporting interval', async () => {
    render(<Directory initial="days=30&page=3&q=North" />)
    await screen.findByRole('link', { name: /Northstar Labs/ })
    for (const [label, value, key] of [['Access status', 'suspended', 'access'], ['Onboarding status', 'awaiting_admin', 'onboarding'],
      ['Workspace activity', 'idle', 'activity'], ['Sort companies', 'name', 'sort']]) {
      fireEvent.change(screen.getByRole('combobox', { name: label }), { target: { value } })
      await waitFor(() => expect(listPlatformCompanies.mock.calls.at(-1)[0]).toMatchObject({ [key]: value, page: 1, days: 30, q: 'North' }))
    }
    fireEvent.change(screen.getByRole('combobox', { name: 'Reporting period' }), { target: { value: '7' } })
    await waitFor(() => expect(listPlatformCompanies.mock.calls.at(-1)[0]).toMatchObject({ days: 7, page: 1 }))
  })

  it('uses the server total for next and previous pages', async () => {
    render(<Directory />)
    await screen.findByRole('link', { name: /Northstar Labs/ })
    expect(screen.getByRole('button', { name: 'Previous' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(listPlatformCompanies.mock.calls.at(-1)[0].page).toBe(2))
    await screen.findByText('9–16 of 17 companies')
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    await waitFor(() => expect(listPlatformCompanies.mock.calls.at(-1)[0].page).toBe(1))
  })

  it('clears empty filters and distinguishes an unregistered platform from no search results', async () => {
    listPlatformCompanies.mockResolvedValue({ items: [], total: 0, page_size: 8 })
    render(<Directory initial="q=Missing&access=suspended&days=30" />)
    await screen.findByRole('heading', { name: 'No companies found' })
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await screen.findByRole('heading', { name: 'No companies yet' })
    expect(screen.getByRole('searchbox', { name: 'Search companies' }).value).toBe('')
    expect(listPlatformCompanies.mock.calls.at(-1)[0]).toMatchObject({ days: 30, q: '', access: '' })
  })

  it('recovers an out-of-range page without pretending there are no companies', async () => {
    listPlatformCompanies.mockResolvedValue({ items: [], total: 4, page_size: 8 })
    const changed = vi.fn()
    render(<Directory initial="page=10" onChange={changed} />)
    await screen.findByRole('heading', { name: 'No companies on this page' })
    fireEvent.click(screen.getByRole('button', { name: 'First page' }))
    expect(changed).toHaveBeenCalledWith({ page: null })
  })

  it('exposes loading and a recoverable failure while keeping filter controls usable', async () => {
    let reject
    listPlatformCompanies.mockReturnValueOnce(new Promise((_, fail) => { reject = fail }))
    render(<Directory />)
    expect(screen.getByText('Loading companies…')).toBeTruthy()
    await waitFor(() => expect(listPlatformCompanies).toHaveBeenCalled())
    await act(async () => reject(new Error('Company reporting is temporarily unavailable')))
    await screen.findByText('Company reporting is temporarily unavailable')
    expect(screen.getByRole('combobox', { name: 'Access status' }).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('link', { name: /Northstar Labs/ })
  })
})
