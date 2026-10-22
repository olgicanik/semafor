import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Overlap-safe polling hook.
 *
 * The next tick is scheduled ONLY after the current fetch settles, and
 * refresh() carries an in-flight guard, so a slow request (> intervalMs) can
 * never overlap the following one — including the mount fetch vs. the first
 * scheduled tick (v3 G2). A null fetchFn disables polling (used when the
 * analytics tab is hidden); a `cancelled` flag (v4 G6) additionally stops the
 * recursive timer chain when the effect re-runs or the hook unmounts WHILE a
 * fetch is in flight — otherwise the just-settled tick would re-arm a timeout
 * the cleanup can no longer clear, leaving an endless 10 s timer chain.
 * Verified: that chain was reproduced on v3 (unmount mid-flight → fetchFn kept
 * being called; `fetchFn -> null` mid-flight → `vi.getTimerCount()` stayed 1)
 * and is gone on this version (covered by usePolling.test.js).
 *
 * @param {() => Promise<any> | null} fetchFn  async fetcher; rejects on error
 * @param {number} intervalMs                  ms between *completed* fetches
 * @returns {{ data, error, lastUpdated, isFetching, tick, refresh }}
 */
export default function usePolling(fetchFn, intervalMs = 10000) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null) // Date | null
  const [isFetching, setIsFetching] = useState(false)
  const [tick, setTick] = useState(0) // increments per completed poll (drives progress bar)

  // Keep the latest fetchFn without re-running the effect every render.
  const fetchRef = useRef(fetchFn)
  useEffect(() => {
    fetchRef.current = fetchFn
  }, [fetchFn])

  // In-flight guard (v3 G2): refresh() no-ops while a fetch is already pending,
  // so the mount fetch and the first scheduled tick can never overlap even when
  // a request takes longer than intervalMs. State can't do this job alone —
  // setState is async, so we use a ref.
  const inFlightRef = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return
    if (!fetchRef.current) return
    inFlightRef.current = true
    setIsFetching(true)
    try {
      const result = await fetchRef.current()
      setData(result)
      setError(null)
      setLastUpdated(new Date())
      setTick((t) => t + 1)
    } catch (err) {
      setError(err?.message ?? 'Request failed')
    } finally {
      inFlightRef.current = false
      setIsFetching(false)
    }
  }, [])

  useEffect(() => {
    if (!fetchFn) return
    let cancelled = false // v4 G6: left-true after cleanup so an in-flight tick
    refresh()             // cannot re-arm the chain past re-run/unmount
    let timer = null
    const schedule = () => {
      timer = setTimeout(async () => {
        await refresh()   // wait for completion before scheduling the next one
        if (!cancelled) schedule() // stop the chain once cleanup has run
      }, intervalMs)
    }
    schedule()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [fetchFn, intervalMs, refresh])

  return { data, error, lastUpdated, isFetching, tick, refresh }
}
