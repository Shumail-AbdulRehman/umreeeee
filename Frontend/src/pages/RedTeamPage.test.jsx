import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import RedTeamPage from './RedTeamPage'
import * as api from '../services/redTeam/redTeamService'

vi.mock('../services/redTeam/redTeamService', () => Object.fromEntries([
  'redTeamCapabilities', 'listRedTeamTests', 'createRedTeamTest', 'updateRedTeamTest', 'getRedTeamTest',
  'launchRedTeamTest', 'cancelRedTeamTest', 'cloneRedTeamTest', 'listRedTeamResults', 'getRedTeamResult',
  'getRedTeamReport', 'compareRedTeamTests', 'downloadRedTeamExport',
].map((name) => [name, vi.fn()])))
vi.mock('../services/integrations/llmIntegrationService', () => ({ fetchLLMIntegrations: async () => [
  { id: 'i', account_name: 'Fake', provider: 'ollama', status: 'active', models: ['fake'] },
] }))
vi.mock('../services/users/userManagementService', () => ({ fetchManagedUsers: async () => ({ items: [] }) }))
vi.mock('../components/AnalyticsChart', () => ({ default: () => <div>Category chart</div> }))

const draft = { id: 'a', name: 'Synthetic baseline', version: 1, format: 'plugins', status: 'draft',
  model: 'fake', integration_id: 'i', mode: 'raw', plugins: ['pii'], strategies: [], tests_per_plugin: 1,
  progress: { total_jobs: 6, terminal_jobs: 0, queued: 6, finished: 0 }, threshold_score: .8, seed: 1 }
const report = { risk: { score: 0, level: 'none' }, attack_success: { rate: 0, worked: 0, decided: 1 },
  decided: { decided: 1, adversarial: 1 }, plugins: [], strategies: [], controls: {}, compliance: [
    { framework: 'owasp', name: 'OWASP', totals: { total: 10, passed: 1, failed: 0, not_tested: 9 }, controls: [] },
  ] }

beforeEach(() => {
  vi.resetAllMocks()
  window.history.replaceState(null, '', '#red-team')
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  api.redTeamCapabilities.mockResolvedValue({ plugins: [{ id: 'pii', name: 'Personal data leak', group: 'Privacy', severity: 'high' }],
    strategies: [], frameworks: [], worker_observed: true, dispatcher_observed: true, broker_transport_reachable: true })
  api.listRedTeamTests.mockResolvedValue({ items: [], total: 0, page_size: 20 })
  api.getRedTeamTest.mockResolvedValue({ test: draft })
  api.getRedTeamReport.mockResolvedValue(report)
  api.listRedTeamResults.mockResolvedValue({ items: [], counts: {}, total: 0, page_size: 20 })
  api.updateRedTeamTest.mockResolvedValue({ test: { ...draft, version: 2 } })
  api.launchRedTeamTest.mockResolvedValue({ test: { ...draft, status: 'queued', version: 2 } })
})
afterEach(() => vi.useRealTimers())

function at(hash) {
  window.history.replaceState(null, '', hash)
  return render(<RedTeamPage />)
}

describe('Red Team composition', () => {
  it('opens list and navigates to the new editor', async () => {
    at('#red-team')
    expect(await screen.findByText('No Red Team tests yet')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'New test' })[0])
    expect(await screen.findByLabelText('Test name')).toBeTruthy()
  })
  it('routes directly to a new editor', async () => {
    at('#red-team?new=1')
    expect(await screen.findByRole('heading', { name: 'New Red Team test' })).toBeTruthy()
  })
  it('prefills a draft', async () => {
    at('#red-team?test=a')
    expect((await screen.findByLabelText('Test name')).value).toBe(draft.name)
  })
  it('shows progress for a running test', async () => {
    api.getRedTeamTest.mockResolvedValue({ test: { ...draft, status: 'running' } })
    at('#red-team?test=a')
    expect(await screen.findByRole('progressbar')).toBeTruthy()
    expect(screen.getByText('Not yet')).toBeTruthy()
  })
  it('renders report sections and normalizes compliance totals', async () => {
    api.getRedTeamTest.mockResolvedValue({ test: { ...draft, status: 'completed' } })
    at('#red-team?test=a')
    expect(await screen.findByText('What broke, by plugin')).toBeTruthy()
    expect(screen.getByRole('tab', { name: /OWASP/ }).textContent).toContain('1 passed')
    expect(screen.getByRole('heading', { name: 'Results' })).toBeTruthy()
  })
  it('preserves the legacy report', async () => {
    api.getRedTeamTest.mockResolvedValue({ test: { ...draft, format: 'categories', status: 'completed',
      score: { compliance_score: .8, categories: {}, control_results: {} } } })
    at('#red-team?test=a')
    expect(await screen.findByText(/used the earlier category format/)).toBeTruthy()
  })
  it('reuses the launch key and saved version after an ambiguous launch failure', async () => {
    api.launchRedTeamTest.mockRejectedValueOnce(new Error('Network interrupted'))
    at('#red-team?test=a')
    const launch = await screen.findByRole('button', { name: 'Save and launch' })
    await waitFor(() => expect(launch.disabled).toBe(false))
    fireEvent.click(launch)
    expect(await screen.findByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save and launch' }))
    await waitFor(() => expect(api.launchRedTeamTest).toHaveBeenCalledTimes(2))
    expect(api.launchRedTeamTest.mock.calls[0]).toEqual(api.launchRedTeamTest.mock.calls[1])
    expect(api.updateRedTeamTest).toHaveBeenCalledTimes(1)
  })
  it('polls again after launching a draft', async () => {
    vi.useFakeTimers()
    at('#red-team?test=a')
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    fireEvent.click(screen.getByRole('button', { name: 'Save and launch' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    api.getRedTeamTest.mockResolvedValue({ test: { ...draft, status: 'queued' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(api.getRedTeamTest).toHaveBeenCalledTimes(2)
  })
  it('requires cancel confirmation and sends exactly one request', async () => {
    api.getRedTeamTest.mockResolvedValue({ test: { ...draft, status: 'running' } })
    api.cancelRedTeamTest.mockResolvedValue({ test: { ...draft, status: 'cancelled' } })
    at('#red-team?test=a')
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel test' }))
    expect(api.cancelRedTeamTest).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel test' }))
    await waitFor(() => expect(api.cancelRedTeamTest).toHaveBeenCalledTimes(1))
  })
  it('exports JSON and CSV', async () => {
    api.getRedTeamTest.mockResolvedValue({ test: { ...draft, status: 'completed' } })
    at('#red-team?test=a')
    fireEvent.click(await screen.findByRole('button', { name: 'Export JSON' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export CSV' }).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
    await waitFor(() => expect(api.downloadRedTeamExport.mock.calls).toEqual([['a', 'json'], ['a', 'csv']]))
  })
  it('shows 422 field errors in the editor and keeps entered values', async () => {
    api.updateRedTeamTest.mockRejectedValue({ message: 'Invalid test', fieldErrors: { plugins: ['Choose a supported plugin'] } })
    at('#red-team?test=a')
    fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('Choose a supported plugin')).toBeTruthy()
    expect(screen.getByLabelText('Test name').value).toBe(draft.name)
    expect(screen.getAllByText('Invalid test')).toHaveLength(1)
  })
  it('maps Controls and evidence filters to API fields', async () => {
    api.getRedTeamTest.mockResolvedValue({ test: { ...draft, status: 'completed' } })
    at('#red-team?test=a')
    fireEvent.click(await screen.findByRole('button', { name: /^Controls/ }))
    fireEvent.change(screen.getByLabelText('Evidence'), { target: { value: 'judge' } })
    await waitFor(() => expect(api.listRedTeamResults).toHaveBeenLastCalledWith('a', expect.objectContaining({
      case_kind: 'control', verdict: '', verdict_source: 'judge', page: 1,
    })))
  })
  it('creates a v3 draft and opens its saved editor', async () => {
    api.createRedTeamTest.mockResolvedValue({ test: draft })
    at('#red-team?new=1')
    fireEvent.change(await screen.findByLabelText('Test name'), { target: { value: 'New synthetic test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(api.createRedTeamTest).toHaveBeenCalledWith(expect.objectContaining({
      name: 'New synthetic test', format: 'plugins', judge: null,
    })))
    await waitFor(() => expect(window.location.hash).toBe('#red-team?test=a'))
    expect((await screen.findByLabelText('Test name')).value).toBe(draft.name)
  })
  it('clones into the opposite mode and opens the clone', async () => {
    api.getRedTeamTest.mockResolvedValueOnce({ test: { ...draft, status: 'completed' } })
    api.cloneRedTeamTest.mockResolvedValue({ test: { ...draft, id: 'b', mode: 'protected' } })
    at('#red-team?test=a')
    fireEvent.click(await screen.findByRole('button', { name: 'Clone as protected' }))
    await waitFor(() => expect(api.cloneRedTeamTest).toHaveBeenCalledWith('a', 'protected'))
    await waitFor(() => expect(window.location.hash).toBe('#red-team?test=b'))
  })
  it('opens attack details and ignores a detail response after closing', async () => {
    api.getRedTeamTest.mockResolvedValue({ test: { ...draft, status: 'completed' } })
    api.listRedTeamResults.mockResolvedValue({ items: [{ id: 'job', attack_index: 0, verdict: 'fail' }], total: 1 })
    let resolveDetail
    api.getRedTeamResult.mockImplementation(() => new Promise((resolve) => { resolveDetail = resolve }))
    at('#red-team?test=a')
    fireEvent.click(await screen.findByRole('button', { name: 'View attack 1' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await act(async () => { resolveDetail({ result: { attack_index: 0, verdict: 'fail' } }) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.getRedTeamResult).toHaveBeenCalledWith('a', 'job')
  })

})

it('updates and launches a legacy clone without changing its format', async () => {
  const legacy = { ...draft, format: 'categories', plugins: undefined, attack_categories: ['direct_injection'], num_attacks: 1 }
  api.getRedTeamTest.mockResolvedValue({ test: legacy })
  api.updateRedTeamTest.mockResolvedValue({ test: { ...legacy, version: 2 } })
  api.launchRedTeamTest.mockResolvedValue({ test: { ...legacy, version: 2, status: 'queued' } })
  at('#red-team?test=a')
  const launch = await screen.findByRole('button', { name: 'Save and launch' })
  await waitFor(() => expect(launch.disabled).toBe(false))
  fireEvent.click(launch)
  await waitFor(() => expect(api.launchRedTeamTest).toHaveBeenCalledTimes(1))
  expect(api.updateRedTeamTest).toHaveBeenCalledWith('a', expect.objectContaining({ format: 'categories', attack_categories: ['direct_injection'], num_attacks: 1, version: 1 }))
  expect(api.updateRedTeamTest.mock.calls[0][1]).not.toHaveProperty('plugins')
})
