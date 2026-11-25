import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import usePlatformResource from './usePlatformResource'

describe('platform request lifecycle', () => {
  it('aborts obsolete company queries and ignores their late responses', async () => {
    const pending = []
    const load = vi.fn((id, signal) => new Promise((resolve) => pending.push({ id, signal, resolve })))
    const { result, rerender } = renderHook(({ id }) => usePlatformResource((signal) => load(id, signal), [id]), {
      initialProps: { id: 'first' },
    })
    await waitFor(() => expect(pending).toHaveLength(1))
    rerender({ id: 'second' })
    await waitFor(() => expect(pending).toHaveLength(2))
    expect(pending[0].signal.aborted).toBe(true)
    await act(async () => pending[1].resolve({ id: 'second' }))
    expect(result.current.data).toEqual({ id: 'second' })
    await act(async () => pending[0].resolve({ id: 'first' }))
    expect(result.current.data).toEqual({ id: 'second' })
  })

  it('recovers an unavailable query without rerunning for inline loader changes', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue({ total: 2 })
    const { result, rerender, unmount } = renderHook(() => usePlatformResource((signal) => load(signal), [7]))
    await waitFor(() => expect(result.current.error?.message).toBe('Unavailable'))
    rerender()
    expect(load).toHaveBeenCalledTimes(1)
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.data).toEqual({ total: 2 }))
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(false)
    const signal = load.mock.calls[1][0]
    unmount()
    expect(signal.aborted).toBe(true)
  })
})
