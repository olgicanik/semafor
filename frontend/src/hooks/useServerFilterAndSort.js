import { useMemo } from 'react';
import { ENV_ALL, ENV_PINNED } from '../utils/constants.js';
import { severityRank } from '../utils/statusCalculator.js';

export const SORT_KEYS = Object.freeze({ NAME: 'name', SEVERITY: 'severity' });
export const FILTER_ALL = 'all';

function matchesQuery(server, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    server.id ?? '', server.name ?? '', server.environment ?? '',
    ...(server.jobs ?? []).flatMap((job) => [job.id ?? '', job.name ?? '', job.project ?? '']),
  ].join(' ').toLowerCase();
  return q.split(/\s+/).every((term) => haystack.includes(term)); // fuzzy: every token matches
}

/**
 * useServerFilterAndSort(servers, { env, searchQuery, statusFilter, sortBy, pinnedIds })
 *  - env: 'all'|'dev'|'qa'|'prod'|'pinned'  ('pinned' = only servers in pinnedIds, any env)
 *  - statusFilter: 'all'|'green'|'orange'|'red' (server kept if ANY job matches)
 *  - sortBy: 'name' | 'severity'
 *  - pinned servers bubble to the top (in non-'pinned' tabs); then severity (red>orange>green>unknown) or name
 *  - within each server, red jobs sort to the very top
 */
export default function useServerFilterAndSort(
  servers,
  { env = ENV_ALL, searchQuery = '', statusFilter = FILTER_ALL, sortBy = SORT_KEYS.NAME, pinnedIds = [] } = {},
) {
  return useMemo(() => {
    const envFiltered = env === ENV_ALL ? servers
      : env === ENV_PINNED ? servers.filter((s) => pinnedIds.includes(s.id))
      : servers.filter((s) => s.environment === env);
    const searched = envFiltered.filter((s) => matchesQuery(s, searchQuery));
    const statusFiltered = statusFilter === FILTER_ALL
      ? searched
      : searched.filter((s) => (s.jobs ?? []).some((job) => job.status === statusFilter));

    const ranked = statusFiltered.map((server) => ({
      server,
      name: String(server.name ?? '').toLowerCase(),
      health: Math.min(...(server.jobs ?? []).map((job) => severityRank(job.status))),
    }));
    ranked.sort((a, b) => {
      const aPinned = pinnedIds.includes(a.server.id);
      const bPinned = pinnedIds.includes(b.server.id);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;      // pinned first
      if (sortBy === SORT_KEYS.SEVERITY && a.health !== b.health) return a.health - b.health;
      return a.name.localeCompare(b.name);
    });
    return ranked.map(({ server }) => ({
      ...server,
      jobs: [...(server.jobs ?? [])].sort((x, y) => severityRank(x.status) - severityRank(y.status)),
    }));
  }, [servers, env, searchQuery, statusFilter, sortBy, pinnedIds]);
}
