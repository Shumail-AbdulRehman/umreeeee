import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import MyActivityPage from './MyActivityPage'
import { getModels, getSeries, getSummary } from '../services/observability'
import { apiRequest } from '../services/api/client'
import { canOpenPage } from '../utils/permissions'

vi.mock('../services/observability', () => ({ getSummary: vi.fn(), getSeries: vi.fn(), getModels: vi.fn() }))
vi.mock('../services/api/client', () => ({ apiRequest: vi.fn() }))
// Chart layout is covered in a real browser; these units exercise report state and API scope.
vi.mock('../components/AnalyticsChart', () => ({ default: ({ title }) => <section><h2>{title}</h2></section> }))
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  PieChart: ({ children }) => <div>{children}</div>,
  Pie: () => null, Cell: () => null, Tooltip: () => null,
}))

const member = { id: '000000000000000000000010', role: 'user' }
const summary = {
  total_submissions: 12, allowed: 9, blocked: 2, errors: { validation_error: 1 }, processing: 0,
  known_prompt_tokens: 900, known_completion_tokens: 300, unknown_usage_runs: 1,
  estimated_cost_usd: '0.012', unknown_cost_runs: 1, violation_events: 2, latency: {},
}
function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
beforeEach(() => {
  vi.clearAllMocks()
  getSummary.mockResolvedValue(summary)
  getSeries.mockResolvedValue({ items: [] })
  getModels.mockResolvedValue({ items: [{ model: 'example-model', provider: 'gemini', runs: 12 }] })
  apiRequest.mockResolvedValue({ items: [{ id: 'run-1', created_at: '2026-11-04T09:00:00Z', model: 'example-model', provider: 'gemini', status: 'allowed', total_tokens: 100 }] })
})

describe('member activity report', () => {
  it('uses the same bounded interval and the current member for all four data requests', async () => {
    render(<MyActivityPage currentUser={member} />)
    await screen.findByLabelText('Your activity summary')
    const queries = [getSummary.mock.calls[0][0], getSeries.mock.calls[0][0], getModels.mock.calls[0][0],
      apiRequest.mock.calls[0][0].split('/prompt-workspace/runs')[1]]
    const params = queries.map((query) => new URLSearchParams(query))
    expect(new Set(params.map((query) => query.get('from'))).size).toBe(1)
    expect(new Set(params.map((query) => query.get('to'))).size).toBe(1)
    expect(params.every((query) => query.get('user_id') === member.id)).toBe(true)
    expect(Date.parse(params[0].get('to')) - Date.parse(params[0].get('from'))).toBe(7 * 86400000)
    expect(params[3].get('page_size')).toBe('5')
    expect(screen.getByRole('link', { name: 'View run' }).getAttribute('href')).toBe('#prompt-studio?run_id=run-1')
  })

  it('clears a previous period immediately and ignores its late response', async () => {
    const late = deferred()
    getSummary.mockImplementation((query) => {
      const params = new URLSearchParams(query)
      const period = (Date.parse(params.get('to')) - Date.parse(params.get('from'))) / 86400000
      return period === 30 ? late.promise : Promise.resolve(summary)
    })
    render(<MyActivityPage currentUser={member} />)
    await screen.findByLabelText('Your activity summary')
    fireEvent.change(screen.getByRole('combobox', { name: 'Activity reporting period' }), { target: { value: '30' } })
    expect(screen.queryByLabelText('Your activity summary')).toBeNull()
    await waitFor(() => expect(getSummary).toHaveBeenCalledTimes(2))
    fireEvent.change(screen.getByRole('combobox', { name: 'Activity reporting period' }), { target: { value: '90' } })
    await screen.findByLabelText('Your activity summary')
    await act(async () => { late.resolve({ ...summary, total_submissions: 98765 }) })
    await waitFor(() => expect(getSummary).toHaveBeenCalledTimes(3))
    expect(screen.queryByText('98,765')).toBeNull()
  })

  it('does not retain a previous account’s report when the account changes', async () => {
    const pending = deferred()
    const { rerender } = render(<MyActivityPage currentUser={member} />)
    await screen.findByLabelText('Your activity summary')
    getSummary.mockReturnValue(pending.promise)
    rerender(<MyActivityPage currentUser={{ ...member, id: '000000000000000000000011' }} />)
    expect(screen.queryByLabelText('Your activity summary')).toBeNull()
    await waitFor(() => expect(getSummary.mock.calls.at(-1)[0]).toContain('user_id=000000000000000000000011'))
    pending.resolve({ ...summary, total_submissions: 3 })
    await screen.findByLabelText('Your activity summary')
  })

  it('shows an actionable failure, clears stale metrics and recovers on retry', async () => {
    render(<MyActivityPage currentUser={member} />)
    await screen.findByLabelText('Your activity summary')
    getSummary.mockRejectedValueOnce(new Error('Analytics temporarily unavailable'))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh my activity' }))
    await screen.findByText('Analytics temporarily unavailable')
    expect(screen.queryByLabelText('Your activity summary')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry activity' }))
    await screen.findByLabelText('Your activity summary')
  })

  it('gives zero activity a real empty state without an invented allowed percentage', async () => {
    getSummary.mockResolvedValue({ ...summary, total_submissions: 0, allowed: 0, blocked: 0, errors: {}, known_prompt_tokens: 0, known_completion_tokens: 0, unknown_usage_runs: 0, unknown_cost_runs: 0, estimated_cost_usd: '0' })
    getModels.mockResolvedValue({ items: [] })
    apiRequest.mockResolvedValue({ items: [] })
    render(<MyActivityPage currentUser={member} />)
    await screen.findByRole('heading', { name: 'No activity in this period' })
    expect(screen.getByRole('heading', { name: 'No outcomes yet' })).toBeTruthy()
    expect(screen.queryByText('100.0%')).toBeNull()
  })

  it('shows fully unknown cost as unknown instead of claiming no spend', async () => {
    getSummary.mockResolvedValue({ ...summary, unknown_cost_runs: 12, estimated_cost_usd: '0' })
    render(<MyActivityPage currentUser={member} />)
    await screen.findByLabelText('Your activity summary')
    expect(screen.getByText('Unknown')).toBeTruthy()
  })

  it('makes no report request without a known account identity', () => {
    render(<MyActivityPage />)
    expect(screen.getByRole('alert').textContent).toContain('Your account could not be identified')
    expect(getSummary).not.toHaveBeenCalled()
    expect(apiRequest).not.toHaveBeenCalled()
  })
})

it('adds only the new member route and preserves all previous route decisions', () => {
  expect(canOpenPage(member, 'my-activity')).toBe(true)
  expect(canOpenPage(null, 'my-activity')).toBe(false)
  expect(canOpenPage({ role: 'org_admin' }, 'my-activity')).toBe(false)
  expect(canOpenPage({ role: 'super_admin' }, 'my-activity')).toBe(false)
  for (const page of ['prompt-studio', 'activity-log', 'violations', 'catalog', 'latency', 'spend']) {
    expect(canOpenPage(member, page)).toBe(true)
    expect(canOpenPage({ role: 'org_admin' }, page)).toBe(true)
  }
  for (const page of ['insights', 'users', 'user-insights', 'inventory', 'integrations', 'settings', 'red-team', 'dlp-policy', 'guardrail-policy']) {
    expect(canOpenPage(member, page)).toBe(false)
    expect(canOpenPage({ role: 'org_admin' }, page)).toBe(true)
    expect(canOpenPage({ role: 'super_admin' }, page)).toBe(true)
  }
})
