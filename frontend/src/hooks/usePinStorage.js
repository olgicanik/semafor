import { useCallback, useEffect, useState } from 'react';

function readStorage(key) {
  try { const p = JSON.parse(localStorage.getItem(key)); return Array.isArray(p) ? p : []; }
  catch { return []; }
}

function writeStorage(key, ids) {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* private mode: ignore */ }
}

/**
 * usePinStorage(key='pinned_servers', { onToggle }) — localStorage pin cache.
 * onToggle(id, isNowPinned) is optional; when provided (backend pin/unpin) it is fired
 * after the optimistic local update and its failure is swallowed (local state stays).
 */
export default function usePinStorage(key = 'pinned_servers', { onToggle } = {}) {
  const [pinnedIds, setPinnedIds] = useState(() => readStorage(key));
  useEffect(() => { writeStorage(key, pinnedIds); }, [key, pinnedIds]);
  const isPinned = useCallback((id) => pinnedIds.includes(id), [pinnedIds]);
  const setPinned = useCallback((ids) => setPinnedIds(ids), []);
  const togglePin = useCallback(async (id) => {
    const next = pinnedIds.includes(id)
      ? pinnedIds.filter((x) => x !== id)
      : [...pinnedIds, id];
    setPinnedIds(next); // optimistic
    if (typeof onToggle === 'function') {
      try { await onToggle(id, next.includes(id)); } catch { /* backend offline */ }
    }
    return next;
  }, [pinnedIds, onToggle]);
  return { pinnedIds, isPinned, togglePin, setPinned };
}
