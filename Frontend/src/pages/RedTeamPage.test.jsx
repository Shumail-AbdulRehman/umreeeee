import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import RedTeamPage from './RedTeamPage'
import * as api from '../services/redTeam/redTeamService'

vi.mock('../services/redTeam/redTeamService', () => Object.fromEntries([
  'redTeamCapabilities', 'listRedTeamTests', 'createRedTeamTest', 'updateRedTeamTest', 'getRedTeamTest',
  'launchRedTeamTest', 'cancelRedTeamTest', 'cloneRedTeamTest', 'listRedTeamResults', 'getRedTeamResult',
  'getRedTeamReport', 'downloadRedTeamExport', 'previewRedTeamConfig', 'getRedTeamTestConfigPreview',
].map((name) => [name, vi.fn()])))
vi.mock('../services/integrations/llmIntegrationService', () => ({ fetchLLMIntegrations: async () => [
  { id: 'i', account_name: 'Fake', provider: 'ollama', status: 'active', models: ['fake'] },
] }))
vi.mock('../services/users/userManagementService', () => ({ fetchManagedUsers: async () => ({ items: [] }) }))
vi.mock('../components/AnalyticsChart', () => ({ default: () => <div>Category chart</div> }))

const draft = { id: 'a', name: 'Synthetic baseline', version: 1, format: 'plugins', status: 'draft',
  purpose: 'Test whether the assistant protects private personal information.',
  model: 'fake', integration_id: 'i', mode: 'raw', plugins: ['pii'], strategies: [], tests_per_plugin: 1,
  grader: { integration_id: 'i', model: 'fake' },
  progress: { total_jobs: 6, terminal_jobs: 0, queued: 6, finished: 0 }, threshold_score: .8, seed: 1 }
const report = { risk: { score: 0, level: 'none' }, attack_success: { rate: 0, worked: 0, decided: 1 },
  decided: { decided: 1, adversarial: 1 }, plugins: [], strategies: [], controls: {}, compliance: [
    { framework: 'owasp', name: 'OWASP', totals: { total: 10, passed: 1, failed: 0, not_tested: 9 }, controls: [] },
  ] }

beforeEach(() => {
  vi.resetAllMocks()
  window.history.replaceState(null, '', '#red-team')
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  api.redTeamCapabilities.mockResolvedValue({ promptfoo: { available: true, cloud_key_configured: true }, plugins: [{ id: 'pii', name: 'Personal data leak', group: 'Privacy', severity: 'high' }],
    strategies: [], frameworks: [], worker_observed: true, dispatcher_observed: true, broker_transport_reachable: true })
  api.listRedTeamTests.mockResolvedValue({ items: [], total: 0, page_size: 20 })
  api.getRedTeamTest.mockResolvedValue({ test: draft })
  api.getRedTeamReport.mockResolvedValue(report)
  api.listRedTeamResults.mockResolvedValue({ items: [], counts: {}, total: 0, page_size: 20 })
  api.updateRedTeamTest.mockResolvedValue({ test: { ...draft, version: 2 } })
  api.launchRedTeamTest.mockResolvedValue({ test: { ...draft, status: 'queued', version: 2 } })
  api.previewRedTeamConfig.mockResolvedValue({ yaml: 'redteam: {}' })
  api.getRedTeamTestConfigPreview.mockResolvedValue({ yaml: 'redteam: {}' })
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
  it('displays each readiness check from the capabilities response independently', async () => {
    api.redTeamCapabilities.mockResolvedValueOnce({
      promptfoo: { version: '0.126.0', available: true, cloud_key_configured: true },
      broker_transport_reachable: false, worker_observed: true, dispatcher_observed: false,
    })
    at('#red-team')
    const banner = within(await screen.findByRole('region', { name: 'Execution readiness' }))
    expect(banner.getByRole('status').textContent).toBe('Launch unavailable')
    expect(banner.getByText('promptfoo 0.126.0')).toBeTruthy()
    expect(banner.getByText('promptfoo Cloud key configured')).toBeTruthy()
    expect(banner.getByText('Worker active')).toBeTruthy()
    expect(banner.getByText('Broker connection unavailable')).toBeTruthy()
    expect(banner.getByText('Dispatcher not responding')).toBeTruthy()
  })
  it('routes directly to a new editor', async () => {
    at('#red-team?new=1')
    expect(await screen.findByRole('heading', { name: 'New Red Team test' })).toBeTruthy()
  })
  it('prefills a draft', async () => {
    at('#red-team?test=a')
    expect((await screen.findByLabelText('Test name')).value).toBe(draft.name)
    expect(api.getRedTeamReport).not.toHaveBeenCalled()
    expect(api.listRedTeamResults).not.toHaveBeenCalled()
  })
  it('shows the API field error for a rejected preview and save', async () => {
    const error = Object.assign(new Error('Check the submitted fields'), {
      fieldErrors: { 'grader.model': ['Choose a supported grader model.'] },
    })
    api.getRedTeamTestConfigPreview.mockRejectedValueOnce(error)
    api.updateRedTeamTest.mockRejectedValueOnce(error)
    at('#red-team?test=a')
    expect(await screen.findByText('Could not build the config preview. Check the submitted fields Choose a supported grader model.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('Check the submitted fields Choose a supported grader model.', { exact: true })).toBeTruthy()
    expect(api.launchRedTeamTest).not.toHaveBeenCalled()
  })
  it('shows progress for a running test', async () => {
    api.getRedTeamTest.mockResolvedValue({ test: { ...draft, status: 'running' } })
    at('#red-team?test=a')
    expect(await screen.findByRole('progressbar')).toBeTruthy()
    expect(screen.getByText('No results recorded yet.')).toBeTruthy()
    expect(screen.queryByText(/calls not available/i)).toBeNull()
  })
  it('shows a recorded zero call count when the other count is missing', async () => {
    api.getRedTeamTest.mockResolvedValue({ test: { ...draft, status: 'running', judge_calls: 0 } })
    at('#red-team?test=a')
    expect(await screen.findByText('0 judge calls')).toBeTruthy()
    expect(screen.queryByText(/model calls/i)).toBeNull()
  })
  it('renders report sections and normalizes compliance totals', async () => {
    api.getRedTeamTest.mockResolvedValue({ test: { ...draft, status: 'completed' } })
    at('#red-team?test=a')
    expect(await screen.findByText('Test breakdown')).toBeTruthy()
    expect(screen.getByRole('tab', { name: /OWASP/ }).textContent).toContain('1 passed')
    expect(screen.getByRole('heading', { name: 'Results' })).toBeTruthy()
  })
  it('shows independent loading and retry states for the report and case results', async () => {
    api.getRedTeamTest.mockResolvedValue({ test: { ...draft, status: 'completed' } })
    let rejectReport
    let rejectResults
    api.getRedTeamReport.mockImplementationOnce(() => new Promise((_, reject) => { rejectReport = reject }))
    api.listRedTeamResults.mockImplementationOnce(() => new Promise((_, reject) => { rejectResults = reject }))
    at('#red-team?test=a')
    expect(await screen.findByText('Loading report…')).toBeTruthy()
    expect(screen.getByText('Loading results…')).toBeTruthy()
    expect(screen.queryByText('Test breakdown')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Results' })).toBeNull()

    await act(async () => { rejectReport(new Error('Report unavailable')) })
    expect(screen.getByText('Could not load report.')).toBeTruthy()
    expect(screen.queryByText('Loading report…')).toBeNull()
    expect(screen.getByText('Loading results…')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry report' }))
    expect(await screen.findByText('Test breakdown')).toBeTruthy()

    await act(async () => { rejectResults(new Error('Results unavailable')) })
    expect(screen.getByText('Could not load results.')).toBeTruthy()
    expect(screen.queryByText('Loading results…')).toBeNull()
    expect(screen.getByText('Test breakdown')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry results' }))
    expect(await screen.findByText('No results have been recorded.')).toBeTruthy()
    expect(api.getRedTeamReport).toHaveBeenCalledTimes(2)
    expect(api.listRedTeamResults).toHaveBeenCalledTimes(2)
  })
  it('hides previous rows and discards an older response when the filters change', async () => {
    api.getRedTeamTest.mockResolvedValue({ test: { ...draft, status: 'completed' } })
    api.listRedTeamResults.mockResolvedValueOnce({ items: [{ id: 'initial', plugin_name: 'Initial row' }], total: 1 })
    let resolveOlder
    api.listRedTeamResults.mockImplementationOnce(() => new Promise((resolve) => { resolveOlder = resolve }))
    api.listRedTeamResults.mockRejectedValueOnce(new Error('Failed to read filtered rows'))
    api.listRedTeamResults.mockResolvedValueOnce({ items: [{ id: 'latest', plugin_name: 'Latest row' }], total: 1 })
    at('#red-team?test=a')
    expect(await screen.findByText('Initial row')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Unsafe' }))
    expect(screen.getByText('Loading results…')).toBeTruthy()
    expect(screen.queryByText('Initial row')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Defended' }))
    expect(await screen.findByText('Could not load results.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry results' }))
    expect(await screen.findByText('Latest row')).toBeTruthy()

    await act(async () => { resolveOlder({ items: [{ id: 'older', plugin_name: 'Older row' }], total: 1 }) })
    expect(screen.queryByText('Older row')).toBeNull()
    expect(screen.getByText('Latest row')).toBeTruthy()
    expect(api.getRedTeamReport).toHaveBeenCalledTimes(1)
  })
  it('reuses the launch key and saved version after an ambiguous launch failure', async () => {
    api.launchRedTeamTest.mockRejectedValueOnce(new Error('Network interrupted'))
    at('#red-team?test=a')
    const launch = await screen.findByRole('button', { name: 'Launch test' })
    await waitFor(() => expect(launch.disabled).toBe(false))
    fireEvent.click(launch)
    expect(await screen.findByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Launch test' }))
    await waitFor(() => expect(api.launchRedTeamTest).toHaveBeenCalledTimes(2))
    expect(api.launchRedTeamTest.mock.calls[0]).toEqual(api.launchRedTeamTest.mock.calls[1])
    expect(api.updateRedTeamTest).toHaveBeenCalledTimes(1)
  })
  it('polls again after launching a draft', async () => {
    vi.useFakeTimers()
    at('#red-team?test=a')
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    fireEvent.click(screen.getByRole('button', { name: 'Launch test' }))
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
    for (const format of ['JSON', 'CSV']) {
      const trigger = await screen.findByRole('button', { name: 'Export' })
      await waitFor(() => expect(trigger.disabled).toBe(false))
      fireEvent.keyDown(trigger, { key: 'Enter' })
      fireEvent.click(await screen.findByRole('menuitem', { name: `Download ${format}` }))
    }
    await waitFor(() => expect(api.downloadRedTeamExport.mock.calls).toEqual([['a', 'json'], ['a', 'csv']]))
  })
  it('shows 422 field errors in the editor and keeps entered values', async () => {
    api.updateRedTeamTest.mockRejectedValue({ message: 'Invalid test', fieldErrors: { plugins: ['Choose a supported plugin'] } })
    at('#red-team?test=a')
    fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('Choose a supported plugin')).toBeTruthy()
    expect(screen.getByLabelText('Test name').value).toBe(draft.name)
    expect(screen.getAllByText('Invalid test Choose a supported plugin')).toHaveLength(1)
  })
  it('maps verdict and source filters to API fields', async () => {
    api.getRedTeamTest.mockResolvedValue({ test: { ...draft, status: 'completed' } })
    at('#red-team?test=a')
    fireEvent.click(await screen.findByRole('button', { name: /^Unsafe/ }))
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'grader' } })
    await waitFor(() => expect(api.listRedTeamResults).toHaveBeenLastCalledWith('a', expect.objectContaining({
      verdict: 'fail', verdict_source: 'grader', page: 1,
    })))
  })
  it('creates a v3 draft and opens its saved editor', async () => {
    api.createRedTeamTest.mockResolvedValue({ test: draft })
    at('#red-team?new=1')
    fireEvent.change(await screen.findByLabelText('Test name'), { target: { value: 'New synthetic test' } })
    fireEvent.change(screen.getByLabelText('Integration'), { target: { value: 'i' } })
    fireEvent.change(screen.getByLabelText('Purpose'), { target: { value: draft.purpose } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Personal data leak/ }))
    fireEvent.change(screen.getByLabelText('Grader integration'), { target: { value: 'i' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(api.createRedTeamTest).toHaveBeenCalledWith(expect.objectContaining({
      name: 'New synthetic test', grader: { integration_id: 'i', model: 'fake' },
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
