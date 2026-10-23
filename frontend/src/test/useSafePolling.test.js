import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useSafePolling from '../hooks/useSafePolling.js';

describe('useSafePolling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches once on mount', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn().mockResolvedValue('ok');
    renderHook(() => useSafePolling(fetchFn, 1000));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await act(async () => { await Promise.resolve(); });
  });

  it('refetches on the interval once fetches settle', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn().mockResolvedValue('ok');
    renderHook(() => useSafePolling(fetchFn, 1000));
    expect(fetchFn).toHaveBeenCalledTimes(1); // mount fetch
    await act(async () => { await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(1000); });
    await act(async () => { await Promise.resolve(); });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    await act(async () => { vi.advanceTimersByTime(1000); });
    await act(async () => { await Promise.resolve(); });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('an unresolved fetcher prevents a second call (overlap lock)', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn().mockImplementation(() => new Promise(() => {}));
    renderHook(() => useSafePolling(fetchFn, 1000));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(60 * 1000); });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('a rejected fetcher sets error and the loop continues', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue('ok');
    const { result } = renderHook(() => useSafePolling(fetchFn, 1000));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.error).toBe('boom');
    await act(async () => { vi.advanceTimersByTime(1000); });
    await act(async () => { await Promise.resolve(); });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result.current.data).toBe('ok');
  });

  it('secondsUntilNextPoll counts down via the deadline (no monotonic drift)', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn().mockResolvedValue('ok');
    const { result } = renderHook(() => useSafePolling(fetchFn, 10000));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(result.current.secondsUntilNextPoll).toBeLessThanOrEqual(9);
    expect(result.current.secondsUntilNextPoll).toBeGreaterThanOrEqual(8);
  });

  it('triggerRefresh resolves to the data and does not double-poll on the stale slot', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn().mockResolvedValue('fresh');
    const { result } = renderHook(() => useSafePolling(fetchFn, 1000));
    await act(async () => { await Promise.resolve(); });
    let resolved;
    act(() => { resolved = result.current.triggerRefresh(); });
    await act(async () => { await resolved; });
    expect(await resolved).toBe('fresh');
    const callsAfterRefresh = fetchFn.mock.calls.length;
    // advance past the old pending loop timer slot — no duplicate poll should fire
    await act(async () => { vi.advanceTimersByTime(1000); });
    await act(async () => { await Promise.resolve(); });
    expect(fetchFn.mock.calls.length).toBe(callsAfterRefresh + 1); // just the re-armed one
  });

  it('pauses when fetchFn becomes null and never resumes on its own', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn().mockResolvedValue('ok');
    const { rerender } = renderHook(({ fn }) => useSafePolling(fn, 1000), {
      initialProps: { fn: fetchFn },
    });
    await act(async () => { await Promise.resolve(); });
    rerender({ fn: null });
    const callsBefore = fetchFn.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(10 * 60 * 1000); });
    expect(fetchFn.mock.calls.length).toBe(callsBefore);
  });

  it('triggerRefresh while paused does not re-arm an empty timer chain', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn().mockResolvedValue('ok');
    const { result } = renderHook(() => useSafePolling(null, 1000)); // paused on mount
    await act(async () => { await Promise.resolve(); });
    expect(vi.getTimerCount()).toBe(0);

    // Manual refresh while paused: step -> pollNow (early-null) must NOT re-arm the loop,
    // or a self-sustaining chain of empty timeouts runs forever (M4).
    act(() => { result.current.triggerRefresh(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { vi.advanceTimersByTime(10 * 60 * 1000); });
    expect(fetchFn).not.toHaveBeenCalled(); // paused: the (null) fetcher is never invoked
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not leave an orphaned timer chain when stopped mid-flight (port of v4 G6)', async () => {
    vi.useFakeTimers();
    let resolveFetch;
    const fetchFn = vi
      .fn()
      .mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));

    const { rerender } = renderHook(({ fn }) => useSafePolling(fn, 1000), {
      initialProps: { fn: fetchFn },
    });

    // Settle the mount fetch, then let the first scheduled tick fire: that tick
    // starts fetch #2 and suspends at `await refresh()` (the leak window).
    await act(async () => { resolveFetch('ok'); await Promise.resolve(); await Promise.resolve(); });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(fetchFn).toHaveBeenCalledTimes(2); // fetch #2 is now in flight (deferred)

    // Pause the poller (fetchFn -> null) while fetch #2 is still pending — the
    // exact window where the v3 chain re-armed a timeout nothing could clear.
    rerender({ fn: null });
    const settledCalls = fetchFn.mock.calls.length;
    await act(async () => { resolveFetch('ok'); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(10 * 60 * 1000); });

    expect(fetchFn.mock.calls.length).toBe(settledCalls); // no further fetches
    expect(vi.getTimerCount()).toBe(0);                    // no orphaned timer chain
  });

  it('StrictMode double-mount does not double-fire fetches', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn().mockResolvedValue('ok');
    const React = await import('react');
    const wrapper = ({ children }) => React.createElement(React.StrictMode, null, children);
    renderHook(() => useSafePolling(fetchFn, 1000), { wrapper });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
