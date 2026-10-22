import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import usePinStorage from '../hooks/usePinStorage.js';

const KEY = 'pinned_servers';

describe('usePinStorage', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('toggles a pin into and out of the persisted cache', () => {
    const { result } = renderHook(() => usePinStorage(KEY));
    act(() => { result.current.togglePin('srv-1'); });
    expect(result.current.pinnedIds).toEqual(['srv-1']);
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual(['srv-1']);
    act(() => { result.current.togglePin('srv-1'); });
    expect(result.current.pinnedIds).toEqual([]);
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual([]);
  });

  it('seeds from setPinned', () => {
    const { result } = renderHook(() => usePinStorage(KEY));
    act(() => { result.current.setPinned(['a', 'b']); });
    expect(result.current.isPinned('a')).toBe(true);
    expect(result.current.isPinned('c')).toBe(false);
  });

  it('calls onToggle with (id, nextPinned)', async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePinStorage(KEY, { onToggle }));
    await act(() => result.current.togglePin('srv-2'));
    expect(onToggle).toHaveBeenCalledWith('srv-2', true);
    await act(() => result.current.togglePin('srv-2'));
    expect(onToggle).toHaveBeenCalledWith('srv-2', false);
  });

  it('a rejected onToggle leaves the optimistic local state', async () => {
    const onToggle = vi.fn().mockRejectedValue(new Error('backend offline'));
    const { result } = renderHook(() => usePinStorage(KEY, { onToggle }));
    await act(() => result.current.togglePin('srv-3'));
    expect(result.current.pinnedIds).toEqual(['srv-3']); // still pinned locally
  });

  it('survives a remount by reading back from storage', () => {
    const first = renderHook(() => usePinStorage(KEY));
    act(() => { first.result.current.togglePin('srv-4'); });
    first.unmount();
    const second = renderHook(() => usePinStorage(KEY));
    expect(second.result.current.pinnedIds).toEqual(['srv-4']);
  });
});
