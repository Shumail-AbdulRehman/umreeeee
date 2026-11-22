import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest, getAuthToken } from '../api/client'
import { beginTrackedRequest } from '../api/requestActivity'
import {
  buildQuery,
  buildResultsQuery,
  cancelRedTeamTest,
  cloneRedTeamTest,
  createRedTeamTest,
  downloadRedTeamExport,
  getRedTeamReport,
  getRedTeamResult,
  getRedTeamTest,
  launchRedTeamTest,
  listRedTeamResults,
  listRedTeamTests,
  redTeamCapabilities,
  updateRedTeamTest,
} from './redTeamService'

vi.mock('../api/client', () => ({ apiRequest: vi.fn(), getAuthToken: vi.fn() }))
vi.mock('../api/requestActivity', () => ({ beginTrackedRequest: vi.fn() }))

beforeEach(() => {
  apiRequest.mockReset().mockResolvedValue({})
  getAuthToken.mockReset().mockReturnValue('synthetic-bearer-value')
  beginTrackedRequest.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('results query', () => {
  it('encodes filter IDs, retains page values and drops unset or unrelated fields', async () => {
    await listRedTeamResults('t1', {
      plugin: 'family/type', strategy: 'variant:v2', verdict: 'pass', verdict_source: 'grader',
      case_kind: null, state: undefined, category: '', page: 0, page_size: 20, token: 'synthetic',
    })
    expect(apiRequest).toHaveBeenCalledWith('/red-team/tests/t1/results?plugin=family%2Ftype&strategy=variant%3Av2&verdict=pass&verdict_source=grader&page=0&page_size=20')
  })
  it('omits the question mark when nothing is set', () => {
    expect(buildResultsQuery({ plugin: '' })).toBe('')
    expect(buildResultsQuery(null)).toBe('')
  })
  it('normalizes legacy strings and transmits only supported parameters', async () => {
    await listRedTeamResults('t1', '?plugin=a%26b&page=3&verdict=&Authorization=synthetic')
    expect(apiRequest).toHaveBeenCalledWith('/red-team/tests/t1/results?plugin=a%26b&page=3')
    await listRedTeamResults('t1', 'page=3')
    expect(apiRequest).toHaveBeenLastCalledWith('/red-team/tests/t1/results?page=3')
    await listRedTeamResults('t1')
    expect(apiRequest).toHaveBeenLastCalledWith('/red-team/tests/t1/results')
    expect(buildQuery('')).toBe('')
  })
  it('encodes search and preserves existing test-list filters', async () => {
    await listRedTeamTests({ page: 1, q: 'A & B', status: 'draft', mode: '', access_token: 'synthetic' })
    expect(apiRequest).toHaveBeenCalledWith('/red-team/tests?page=1&q=A+%26+B&status=draft')
    await listRedTeamTests('page_size=20&mode=raw&api_key=synthetic')
    expect(apiRequest).toHaveBeenLastCalledWith('/red-team/tests?page_size=20&mode=raw')
  })
})

describe('red team endpoints', () => {
  it('preserves explicit runtime availability alongside a detected version', async () => {
    const capabilities = {
      promptfoo: { version: '0.126.0', available: false, cloud_key_configured: false },
      broker_transport_reachable: true, worker_observed: true, dispatcher_observed: true,
    }
    apiRequest.mockResolvedValueOnce(capabilities)
    await expect(redTeamCapabilities()).resolves.toBe(capabilities)
    expect(apiRequest).toHaveBeenCalledWith('/red-team/capabilities')
  })

  it('sends draft configuration, version, cancellation and clone mode over the app wrapper', async () => {
    const draft = {
      name: 'Sample test', purpose: 'Synthetic draft description', integration_id: 'target', model: 'model',
      mode: 'raw', plugins: ['plugin-id'], strategies: [], tests_per_plugin: 1,
      grader: { integration_id: 'grader', model: 'grading-model' },
    }
    const edited = { ...draft, version: 2 }
    await createRedTeamTest(draft)
    await updateRedTeamTest('t1', edited)
    await cancelRedTeamTest('t1')
    await cloneRedTeamTest('t1', 'protected')
    expect(apiRequest.mock.calls).toEqual([
      ['/red-team/tests', { method: 'POST', body: JSON.stringify(draft) }],
      ['/red-team/tests/t1', { method: 'PUT', body: JSON.stringify(edited) }],
      ['/red-team/tests/t1/cancel', { method: 'POST' }],
      ['/red-team/tests/t1/clone', { method: 'POST', body: '{"mode":"protected"}' }],
    ])
  })

  it('reads test detail, result detail and the report with its paired run', async () => {
    const report = { paired: { test_id: 't2' } }
    apiRequest.mockResolvedValueOnce({ test: { id: 't1' } })
      .mockResolvedValueOnce({ result: { id: 'a1' } })
      .mockResolvedValueOnce(report)
    await expect(getRedTeamTest('t1')).resolves.toEqual({ test: { id: 't1' } })
    await expect(getRedTeamResult('t1', 'a/1')).resolves.toEqual({ result: { id: 'a1' } })
    await expect(getRedTeamReport('t1')).resolves.toBe(report)
    expect(apiRequest.mock.calls).toEqual([
      ['/red-team/tests/t1'],
      ['/red-team/tests/t1/results/a%2F1'],
      ['/red-team/tests/t1/report'],
    ])
  })

  it('posts the version and caller UUID again on retry and propagates the original error', async () => {
    const error = Object.assign(new Error('Conflict'), { status: 409, code: 'conflict' })
    const key = '7ee7dbd9-2339-45d0-bdd1-71f167b6e4ad'
    apiRequest.mockRejectedValueOnce(error)
    await expect(launchRedTeamTest('t1', 2, key)).rejects.toBe(error)
    await launchRedTeamTest('t1', 2, key)
    const expected = ['/red-team/tests/t1/launch', {
      method: 'POST', body: '{"version":2}', headers: { 'Idempotency-Key': key },
    }]
    expect(apiRequest.mock.calls).toEqual([expected, expected])
  })
})

describe('export download', () => {
  const fetchMock = vi.fn()
  const finish = vi.fn()
  const createObjectURL = vi.fn(() => 'blob:synthetic')
  const revokeObjectURL = vi.fn()
  let click

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    finish.mockClear()
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
    beginTrackedRequest.mockReturnValue(finish)
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }))
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  it.each(['json', 'csv'])('downloads a %s blob, keeping authentication in the header', async (format) => {
    const blob = new Blob(['synthetic export'])
    fetchMock.mockResolvedValue({ ok: true, blob: async () => blob })

    await downloadRedTeamExport('t1', format)

    expect(fetchMock).toHaveBeenCalledWith(`/api/red-team/tests/t1/export?format=${format}`, {
      headers: { Authorization: 'Bearer synthetic-bearer-value' },
    })
    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(click.mock.contexts[0].download).toBe(`red-team-t1.${format}`)
    expect(finish).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:synthetic')
  })

  it('allows an empty successful export', async () => {
    const blob = new Blob()
    fetchMock.mockResolvedValue({ ok: true, blob: async () => blob })
    await downloadRedTeamExport('t1', 'csv')
    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('throws the server message on HTTP failure without starting a download', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ detail: { message: 'Export unavailable' } }) })
    await expect(downloadRedTeamExport('t1', 'json')).rejects.toThrow('Export unavailable')
    expect(click).not.toHaveBeenCalled()
    expect(finish).toHaveBeenCalledTimes(1)
  })

  it('falls back to the HTTP status for a non-JSON failure', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => { throw new SyntaxError() } })
    await expect(downloadRedTeamExport('t1', 'csv')).rejects.toThrow('Export failed (502)')
    expect(click).not.toHaveBeenCalled()
    expect(finish).toHaveBeenCalledTimes(1)
  })

  it('propagates transport errors and ends request tracking', async () => {
    const error = new TypeError('Failed to fetch')
    fetchMock.mockRejectedValue(error)
    await expect(downloadRedTeamExport('t1', 'json')).rejects.toBe(error)
    expect(finish).toHaveBeenCalledTimes(1)
  })

  it('rejects unsupported formats before fetching', async () => {
    await expect(downloadRedTeamExport('t1', 'txt')).rejects.toThrow('Use json or csv')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
