import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import usePolling from '../hooks/usePolling.js'

describe('usePolling', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('polls repeatedly on the interval once fetches settle', async () => {
    vi.useFakeTimers()
    const fetchFn = vi.fn().mockResolvedValue('ok')
    renderHook(() => usePolling(fetchFn, 1000))
    expect(fetchFn).toHaveBeenCalledTimes(1) // mount fetch
    await act(async () => { await Promise.resolve() })
    await act(async () => { vi.advanceTimersByTime(1000) })
    await act(async () => { await Promise.resolve() })
    expect(fetchFn).toHaveBeenCalledTimes(2)
    await act(async () => { vi.advanceTimersByTime(1000) })
    await act(async () => { await Promise.resolve() })
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('does not leave an orphaned timer chain when stopped mid-flight (v4 G6)', async () => {
    vi.useFakeTimers()
    let resolveFetch
    const fetchFn = vi
      .fn()
      .mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve }))
    const { rerender } = renderHook(({ fn }) => usePolling(fn, 1000), {
      initialProps: { fn: fetchFn },
    })

    // Settle the mount fetch, then let the first scheduled tick fire: that tick
    // starts fetch #2 and suspends at `await refresh()` (the leak window).
    await act(async () => { resolveFetch('ok'); await Promise.resolve(); await Promise.resolve() })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(fetchFn).toHaveBeenCalledTimes(2) // fetch #2 is now in flight (deferred)

    // Hide the poller (fetchFn -> null) while fetch #2 is still pending — the
    // exact window where the v3 chain re-armed a timeout nothing could clear.
    rerender({ fn: null })
    const settledCalls = fetchFn.mock.calls.length
    await act(async () => { resolveFetch('ok'); await Promise.resolve(); await Promise.resolve() })
    await act(async () => { vi.advanceTimersByTime(10 * 60 * 1000) })

    expect(fetchFn.mock.calls.length).toBe(settledCalls) // no further fetches
    expect(vi.getTimerCount()).toBe(0)                    // no orphaned timer chain
  })
})
