import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import useServerFilterAndSort, { FILTER_ALL, SORT_KEYS } from '../hooks/useServerFilterAndSort.js';

// Frontend-vocabulary fixtures (statuses already green|orange|red).
const servers = [
  {
    id: 'srv-dev', name: 'Alpha Dev', environment: 'dev', is_pinned: false,
    jobs: [{ id: 'j1', name: 'App Build', status: 'green' }],
  },
  {
    id: 'srv-qa', name: 'Zeta QA', environment: 'qa', is_pinned: true,
    jobs: [
      { id: 'j2', name: 'Deploy', status: 'red' },
      { id: 'j5', name: 'Archive', status: 'green' },
    ],
  },
  {
    id: 'srv-qa2', name: 'Ace QA', environment: 'qa', is_pinned: false,
    jobs: [{ id: 'j3', name: 'Test', status: 'green' }],
  },
  {
    id: 'srv-prod', name: 'Gamma Prod', environment: 'prod', is_pinned: false,
    jobs: [{ id: 'j4', name: 'Nightly', status: 'orange' }],
  },
];

const base = { env: 'all', searchQuery: '', statusFilter: FILTER_ALL, sortBy: SORT_KEYS.NAME, pinnedIds: [] };

function ids(list) {
  return list.map((s) => s.id);
}

describe('useServerFilterAndSort', () => {
  it('returns all servers for env=all (name sort)', () => {
    const { result } = renderHook(() => useServerFilterAndSort(servers, base));
    expect(ids(result.current)).toEqual(['srv-qa2', 'srv-dev', 'srv-prod', 'srv-qa']);
  });

  it('filters by environment', () => {
    const { result } = renderHook(() => useServerFilterAndSort(servers, { ...base, env: 'dev' }));
    expect(ids(result.current)).toEqual(['srv-dev']);
  });

  it('floats pinned servers above unpinned even when the name sorts later (v4 G7)', () => {
    const { result } = renderHook(() => useServerFilterAndSort(servers, {
      ...base, env: 'qa', pinnedIds: ['srv-qa'],
    }));
    expect(ids(result.current)[0]).toBe('srv-qa'); // "Zeta" pinned → top despite alpha sort
  });

  it('keeps only servers with a matching job status', () => {
    const { result } = renderHook(() => useServerFilterAndSort(servers, { ...base, statusFilter: 'red' }));
    expect(ids(result.current)).toEqual(['srv-qa']);
  });

  it('searches job names, server names, and server ids', () => {
    const byJob = renderHook(() => useServerFilterAndSort(servers, { ...base, searchQuery: 'deploy' }));
    expect(ids(byJob.result.current)).toEqual(['srv-qa']);

    const byName = renderHook(() => useServerFilterAndSort(servers, { ...base, searchQuery: 'alpha' }));
    expect(ids(byName.result.current)).toEqual(['srv-dev']);

    const byId = renderHook(() => useServerFilterAndSort(servers, { ...base, searchQuery: 'srv-prod' }));
    expect(ids(byId.result.current)).toEqual(['srv-prod']);
  });

  it('matches every token (fuzzy) and returns [] when nothing matches', () => {
    const { result } = renderHook(() => useServerFilterAndSort(servers, { ...base, searchQuery: 'zzz-no-match' }));
    expect(result.current).toEqual([]);
  });

  it('sorts by severity so red servers come before orange before green (within name groups)', () => {
    const { result } = renderHook(() => useServerFilterAndSort(servers, {
      ...base, sortBy: SORT_KEYS.SEVERITY,
    }));
    expect(ids(result.current)).toEqual(['srv-qa', 'srv-prod', 'srv-qa2', 'srv-dev']);
  });

  it('sorts red jobs to the very top within each server (v4 G2 sort rule)', () => {
    const { result } = renderHook(() => useServerFilterAndSort(servers, { ...base, env: 'qa' }));
    const srvQa = result.current.find((s) => s.id === 'srv-qa');
    expect(srvQa.jobs[0].status).toBe('red');
  });

  it('env=pinned returns only pinned ids across environments', () => {
    const { result } = renderHook(() => useServerFilterAndSort(servers, {
      ...base, env: 'pinned', pinnedIds: ['srv-qa', 'srv-dev'],
    }));
    expect(ids(result.current)).toEqual(['srv-dev', 'srv-qa']);
  });
});
