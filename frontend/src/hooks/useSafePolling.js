import { useCallback, useEffect, useRef, useState } from 'react';

const COUNTDOWN_TICK_MS = 500;

/**
 * useSafePolling(fetcherFn, intervalMs = 10000)
 * Returns { data, error, lastUpdated, isRefreshing, secondsUntilNextPoll, triggerRefresh }.
 *  - polls fetcherFn every intervalMs ms; in-flight lock prevents overlapping requests
 *  - secondsUntilNextPoll counts down to the moment the NEXT poll starts (deadline-based)
 *  - triggerRefresh() forces a poll now, cancels any pending loop timer, and re-arms the
 *    cadence so a manual refresh never produces a duplicate early poll
 *  - pass fetcherFn = null to pause the loop (component stays mounted; effect re-runs on change)
 *  - after unmount/cancel the loop never re-arms (no orphaned timers — regression-guarded in tests)
 */
export default function useSafePolling(fetcherFn, intervalMs = 10000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [secondsUntilNextPoll, setSecondsUntilNextPoll] = useState(0);

  const fetcherRef = useRef(fetcherFn);
  const intervalMsRef = useRef(intervalMs);
  const inFlightRef = useRef(false);
  const pausedRef = useRef(false);
  const cancelledRef = useRef(false);
  const loopTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const deadlineRef = useRef(Date.now() + intervalMs);
  const stepRef = useRef();                        // latest step closure (avoids stale captures)

  fetcherRef.current = fetcherFn;
  intervalMsRef.current = intervalMs;

  const pollNow = useCallback(async () => {
    const fn = fetcherRef.current;
    if (typeof fn !== 'function' || pausedRef.current || cancelledRef.current) return null;
    if (inFlightRef.current) return null;          // overlap lock: never two concurrent requests
    inFlightRef.current = true;
    setIsRefreshing(true);
    try {
      const result = await fn();
      if (!cancelledRef.current) {
        setData(result);
        setError(null);
        setLastUpdated(new Date());
      }
      return result;
    } catch (err) {
      const message = err?.message ?? 'Request failed';
      if (!cancelledRef.current) setError(message);
      return null;
    } finally {
      inFlightRef.current = false;
      setIsRefreshing(false);
    }
  }, []);

  // Re-arm one full interval AFTER the current poll settles, and start the countdown from that
  // exact moment so "Refreshes in Xs" matches when the next poll actually fires.
  const scheduleNext = useCallback(() => {
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    deadlineRef.current = Date.now() + intervalMsRef.current;
    loopTimerRef.current = setTimeout(() => stepRef.current?.(), intervalMsRef.current);
  }, []);

  const step = useCallback(async () => {
    const result = await pollNow();
    // v2 fix: never re-arm after unmount/cancel — an unguarded scheduleNext() here re-arms a
    // fresh timeout every interval forever once the component is gone (the usePolling v3 leak).
    // pausedRef is also checked so triggerRefresh() while fetcherFn === null cannot start a
    // self-sustaining chain of empty polls (the pause branch never sets cancelledRef).
    if (!cancelledRef.current && !pausedRef.current) scheduleNext();
    return result; // resolve to the polled data (or null) so triggerRefresh() is awaitable
  }, [pollNow, scheduleNext]);
  stepRef.current = step;

  // Start/stop. Deps include fetcherFn/intervalMs so passing `null` truly pauses the loop at
  // any time (not just at mount). fetcherFn MUST be referentially stable (useCallback) or the
  // loop restarts on each render — the App wiring in §6.3 satisfies this.
  useEffect(() => {
    if (typeof fetcherRef.current !== 'function') {
      clearTimeout(loopTimerRef.current);
      clearInterval(countdownTimerRef.current);
      pausedRef.current = true;
      setSecondsUntilNextPoll(0);
      return undefined;
    }
    pausedRef.current = false;
    cancelledRef.current = false;
    clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = setInterval(() => {
      if (pausedRef.current || cancelledRef.current) return;
      setSecondsUntilNextPoll(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
    }, COUNTDOWN_TICK_MS);
    stepRef.current?.();                            // fire the first poll immediately
    return () => {
      cancelledRef.current = true;
      pausedRef.current = true;
      clearTimeout(loopTimerRef.current);
      clearInterval(countdownTimerRef.current);
    };
  }, [fetcherFn, intervalMs]);

  // Manual refresh: cancel any pending loop timer first, then poll + re-arm. Resolves to the
  // polled data (or null when skipped/failed), so callers can `await triggerRefresh()`.
  const triggerRefresh = useCallback(() => {
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    return step();
  }, [step]);

  return { data, error, lastUpdated, isRefreshing, secondsUntilNextPoll, triggerRefresh };
}
