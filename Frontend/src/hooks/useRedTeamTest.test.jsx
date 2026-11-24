import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import useRedTeamTest from './useRedTeamTest'
import { getRedTeamTest } from '../services/redTeam/redTeamService'

vi.mock('../services/redTeam/redTeamService', () => ({ getRedTeamTest: vi.fn() }))

const reply = (id, status) => ({ test: { id, status } })
let hidden = false
function setHidden(value) {
  hidden = value
  act(() => { document.dispatchEvent(new Event('visibilitychange')) })
}
const advance = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })

beforeEach(() => {
  vi.useFakeTimers()
  hidden = false
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  getRedTeamTest.mockReset()
})
afterEach(() => { vi.useRealTimers() })

describe('useRedTeamTest polling', () => {
  it('loads a draft once and never polls it', async () => {
    getRedTeamTest.mockResolvedValue(reply('a', 'draft'))
    const { result } = renderHook(() => useRedTeamTest('a'))
    await flush()
    expect(result.current.test.status).toBe('draft')
    await advance(10000)
    expect(getRedTeamTest).toHaveBeenCalledTimes(1)
  })

  it('starts polling when setTest moves a draft to queued, until completed', async () => {
    getRedTeamTest.mockResolvedValueOnce(reply('a', 'draft'))
    const { result } = renderHook(() => useRedTeamTest('a'))
    await flush()
    getRedTeamTest.mockResolvedValue(reply('a', 'running'))
    act(() => result.current.setTest({ id: 'a', status: 'queued' }))
    await advance(2000)
    expect(getRedTeamTest).toHaveBeenCalledTimes(2)
    expect(result.current.test.status).toBe('running')
    await advance(2000)
    expect(getRedTeamTest).toHaveBeenCalledTimes(3)
    getRedTeamTest.mockResolvedValue(reply('a', 'completed'))
    await advance(2000)
    expect(result.current.test.status).toBe('completed')
    const calls = getRedTeamTest.mock.calls.length
    await advance(10000)
    expect(getRedTeamTest).toHaveBeenCalledTimes(calls)
  })

  it('starts polling when refresh returns a running status', async () => {
    getRedTeamTest.mockResolvedValueOnce(reply('a', 'draft'))
    const { result } = renderHook(() => useRedTeamTest('a'))
    await flush()
    getRedTeamTest.mockResolvedValueOnce(reply('a', 'queued')).mockResolvedValue(reply('a', 'queued'))
    await act(async () => { await result.current.refresh() })
    expect(getRedTeamTest).toHaveBeenCalledTimes(2)
    await advance(2000)
    expect(getRedTeamTest).toHaveBeenCalledTimes(3)
  })

  it.each(['failed', 'cancelled', 'partially_failed'])('stops at %s', async (status) => {
    getRedTeamTest.mockResolvedValueOnce(reply('a', 'running')).mockResolvedValue(reply('a', status))
    renderHook(() => useRedTeamTest('a'))
    await flush()
    await advance(2000)
    await advance(10000)
    expect(getRedTeamTest).toHaveBeenCalledTimes(2)
  })

  it('pauses while hidden and resumes on visibility', async () => {
    getRedTeamTest.mockResolvedValue(reply('a', 'running'))
    renderHook(() => useRedTeamTest('a'))
    await flush()
    setHidden(true)
    await advance(10000)
    expect(getRedTeamTest).toHaveBeenCalledTimes(1)
    setHidden(false)
    await flush()
    expect(getRedTeamTest).toHaveBeenCalledTimes(2)
    await advance(2000)
    expect(getRedTeamTest).toHaveBeenCalledTimes(3)
  })

  it('does not overlap a pending status poll when the tab becomes visible', async () => {
    let finishPoll
    getRedTeamTest.mockResolvedValueOnce(reply('a', 'generating'))
      .mockImplementationOnce(() => new Promise((resolve) => { finishPoll = resolve }))
    const { result } = renderHook(() => useRedTeamTest('a'))
    await flush()
    expect(result.current.test.status).toBe('generating')
    await advance(2000)
    expect(getRedTeamTest).toHaveBeenCalledTimes(2)

    setHidden(true)
    setHidden(false)
    expect(getRedTeamTest).toHaveBeenCalledTimes(2)

    await act(async () => { finishPoll(reply('a', 'completed')) })
    expect(result.current.test.status).toBe('completed')
    await advance(10000)
    expect(getRedTeamTest).toHaveBeenCalledTimes(2)
  })

  it('backs off after errors and recovers', async () => {
    getRedTeamTest.mockRejectedValue(new Error('down'))
    const { result } = renderHook(() => useRedTeamTest('a'))
    await flush()
    expect(result.current.error).toBe('down')
    await advance(3999)
    expect(getRedTeamTest).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(getRedTeamTest).toHaveBeenCalledTimes(2)
    await advance(7999)
    expect(getRedTeamTest).toHaveBeenCalledTimes(2)
    getRedTeamTest.mockResolvedValue(reply('a', 'running'))
    await advance(1)
    expect(result.current.error).toBe('')
    expect(result.current.test.status).toBe('running')
  })

  it('discards a late response for the previous test id', async () => {
    let resolveOld
    getRedTeamTest.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
    const { result, rerender } = renderHook(({ id }) => useRedTeamTest(id), { initialProps: { id: 'a' } })
    getRedTeamTest.mockResolvedValue(reply('b', 'draft'))
    rerender({ id: 'b' })
    await flush()
    await act(async () => { resolveOld(reply('a', 'completed')) })
    expect(result.current.test).toEqual({ id: 'b', status: 'draft' })
  })

  it('leaves no pending timer after unmount', async () => {
    getRedTeamTest.mockResolvedValue(reply('a', 'running'))
    const { unmount } = renderHook(() => useRedTeamTest('a'))
    await flush()
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    await advance(10000)
    expect(getRedTeamTest).toHaveBeenCalledTimes(1)
  })

  it('does nothing without a test id', async () => {
    const { result } = renderHook(() => useRedTeamTest(null))
    await advance(5000)
    expect(getRedTeamTest).not.toHaveBeenCalled()
    expect(result.current.test).toBeNull()
  })
})
