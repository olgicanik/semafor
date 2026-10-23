import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from './components/layout/Header.jsx';
import DashboardLayout from './components/layout/DashboardLayout.jsx';
import AnalyticsView from './components/AnalyticsView.jsx';
import AddServerModal from './components/AddServerModal.jsx';
import JobErrorDrawer from './components/domain/job/JobErrorDrawer.jsx';
import useSafePolling from './hooks/useSafePolling.js';
import usePinStorage from './hooks/usePinStorage.js';
import useServerFilterAndSort, { SORT_KEYS } from './hooks/useServerFilterAndSort.js';
import { ENV_ALL, POLL_MS, PIN_STORAGE_KEY, PLATFORM } from './utils/constants.js';
import { toServerView, severityRank } from './utils/statusCalculator.js';
import * as api from './api/mockApi.js';
import mockData, { mockCreateServer } from './utils/mockData.js';
import './styles/components/tabs.css';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';
const ENV_GROUPS = ['dev', 'qa', 'prod'];

export default function App() {
  const [activeTab, setActiveTab] = useState('servers'); // 'servers' | 'analytics'
  const [activeEnv, setActiveEnv] = useState(ENV_ALL);   // 'all'|'dev'|'qa'|'prod'|'pinned'
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState(SORT_KEYS.SEVERITY);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);  // drives JobErrorDrawer

  // Referentially stable fetchers (required by useSafePolling's dep-based start/stop).
  const fetchServersStable = useCallback(
    () => (USE_MOCK ? Promise.resolve(mockData.servers) : api.fetchServers()), [],
  );
  const fetchAnalyticsStable = useCallback(() => api.fetchAnalytics(), []);
  const serversFetcher = useMemo(() => fetchServersStable, [fetchServersStable]);
  // null when the Analytics tab is hidden -> the polling loop truly pauses (no wasted calls).
  const analyticsFetcher = activeTab === 'analytics' ? fetchAnalyticsStable : null;

  const { data, error, lastUpdated, isRefreshing, secondsUntilNextPoll, triggerRefresh } =
    useSafePolling(serversFetcher, POLL_MS);
  const analyticsPoll = useSafePolling(analyticsFetcher, POLL_MS);

  // Reconcile with the backend's durable is_pinned flag (no-op in mock mode).
  const { isPinned, togglePin, setPinned } = usePinStorage(PIN_STORAGE_KEY, {
    onToggle: async (id, nowPinned) => (USE_MOCK ? null : nowPinned ? api.pinServer(id) : api.unpinServer(id)),
  });
  useEffect(() => {
    if (USE_MOCK || !Array.isArray(data)) return;
    setPinned(data.filter((s) => s.is_pinned).map((s) => s.id));
  }, [data, setPinned]);

  const servers = useMemo(() => (Array.isArray(data) ? data.map(toServerView) : []), [data]);
  const pinned = useMemo(() => servers.filter((s) => isPinned(s.id)).map((s) => s.id), [servers, isPinned]);

  const filtered = useServerFilterAndSort(servers, {
    env: activeEnv, searchQuery: query, statusFilter, sortBy, pinnedIds: pinned,
  });

  const counts = useMemo(() => ({
    all: servers.length,
    ...ENV_GROUPS.reduce((acc, env) => { acc[env] = servers.filter((s) => s.environment === env).length; return acc; }, {}),
    pinned: pinned.length,
  }), [servers, pinned]);

  // Open the error drawer: a server routes its worst (red-first) job; a bare job opens directly.
  const openServerErrors = useCallback((arg) => {
    if (!arg) return;
    const job = Array.isArray(arg.jobs)
      ? [...arg.jobs].sort((a, b) => severityRank(a.status) - severityRank(b.status))[0]
      : arg;
    if (job) setSelectedJob(job);
  }, []);

  const handleCreate = useCallback(async (payload) => {
    if (USE_MOCK) {
      mockCreateServer(payload);          // mutate the live mock store (survives next poll)
    } else {
      await api.createServer(payload);
    }
    await triggerRefresh();               // refresh the list from the (mock) store — no setData
    return true;
  }, [triggerRefresh]);

  return (
    <div className="app-shell">
      <Header
        platform={PLATFORM}
        searchValue={query} onSearch={setQuery}
        statusFilter={statusFilter} onStatusFilter={setStatusFilter}
        sortBy={sortBy} onSortBy={setSortBy}
        seconds={secondsUntilNextPoll} isRefreshing={isRefreshing}
        onRefresh={triggerRefresh} onAddServer={() => setIsModalOpen(true)}
        lastUpdated={lastUpdated}
      />
      {error && <div className="app-shell__error" role="alert">Syncing… {error}</div>}
      <div className="app-tabs" role="tablist" aria-label="Dashboard sections">
        <button type="button" role="tab" aria-selected={activeTab === 'servers'}
                className={`env-tab${activeTab === 'servers' ? ' env-tab--active' : ''}`}
                onClick={() => setActiveTab('servers')}>Live Monitor</button>
        <button type="button" role="tab" aria-selected={activeTab === 'analytics'}
                className={`env-tab${activeTab === 'analytics' ? ' env-tab--active' : ''}`}
                onClick={() => setActiveTab('analytics')}>Analytics & Health</button>
      </div>
      {activeTab === 'analytics'
        ? <AnalyticsView analytics={analyticsPoll.data} servers={servers} />
        : <DashboardLayout
            environments={[activeEnv]} counts={counts} activeEnv={activeEnv} onEnvChange={setActiveEnv}
            pinnedServers={pinned} servers={filtered}
            onTogglePin={(id) => togglePin(id)}
            onShowServerErrors={openServerErrors}
            statusFilter={statusFilter}
            empty={filtered.length === 0} />}
      {isModalOpen && <AddServerModal onClose={() => setIsModalOpen(false)} onCreate={handleCreate} />}
      {selectedJob && (
        <JobErrorDrawer job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </div>
  );
}
