import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '../api/client'
import { buildQuery, buildResultsQuery, downloadRedTeamExport, listRedTeamResults, listRedTeamTests } from './redTeamService'

vi.mock('../api/client', () => ({ apiRequest: vi.fn(), getAuthToken: vi.fn(() => 'tok-123') }))
vi.mock('../api/requestActivity', () => ({ beginTrackedRequest: vi.fn(() => vi.fn()) }))

beforeEach(() => { apiRequest.mockReset(); apiRequest.mockResolvedValue({}) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('results query', () => {
  it('encodes a filter object and drops empty values', async () => {
    await listRedTeamResults('t1', { plugin: 'pii', strategy: 'base64', verdict: '', state: undefined, case_kind: null, page: 2, ignored: 'x', verdict_source: 'judge & co' })
    expect(apiRequest).toHaveBeenCalledWith('/red-team/tests/t1/results?plugin=pii&strategy=base64&verdict_source=judge+%26+co&page=2')
  })
  it('omits the question mark when nothing is set', () => {
    expect(buildResultsQuery({ plugin: '' })).toBe('')
  })
  it('keeps string input working unchanged', async () => {
    await listRedTeamResults('t1', '?page=3')
    expect(apiRequest).toHaveBeenCalledWith('/red-team/tests/t1/results?page=3')
    await listRedTeamResults('t1')
    expect(apiRequest).toHaveBeenLastCalledWith('/red-team/tests/t1/results')
    expect(buildQuery('')).toBe('')
  })
  it('accepts an object for the test list too', async () => {
    await listRedTeamTests({ page: 1, q: '', status: 'draft' })
    expect(apiRequest).toHaveBeenCalledWith('/red-team/tests?page=1&status=draft')
  })
})

describe('export download', () => {
  it('uses the normalised base URL and the bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) })
    vi.stubGlobal('fetch', fetchMock)
    URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await downloadRedTeamExport('abc', 'csv')
    expect(fetchMock).toHaveBeenCalledWith('/api/red-team/tests/abc/export?format=csv', { headers: { Authorization: 'Bearer tok-123' } })
  })
  it('throws the server message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ detail: { message: 'nope' } }) }))
    await expect(downloadRedTeamExport('abc', 'json')).rejects.toThrow('nope')
  })
})
