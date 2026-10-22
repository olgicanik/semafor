import { useEffect, useMemo, useState } from 'react'
import {
  createServer,
  fetchAnalytics,
  fetchServers,
  pinServer,
  unpinServer,
} from './api/mockApi.js'
import usePolling from './hooks/usePolling.js'
import ServerCard from './components/ServerCard.jsx'
import AddServerModal from './components/AddServerModal.jsx'
import AnalyticsView from './components/AnalyticsView.jsx'

const POLL_MS = 10000

const ENVIRONMENTS = ['dev', 'qa', 'prod']
const ENV_LABEL = { dev: 'Development', qa: 'QA', prod: 'Production' }
const ENV_BADGE = {
  dev: 'bg-sky-100 text-sky-700',
  qa: 'bg-amber-100 text-amber-700',
  prod: 'bg-rose-100 text-rose-700',
}

const SORT_OPTIONS = [
  { value: 'alpha', label: 'Name (A–Z)' },
  { value: 'active', label: 'Most active jobs' },
  { value: 'errors', label: 'Most errors' },
]

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'green', label: 'Running (green)' },
  { value: 'yellow', label: 'Stopped (yellow)' },
  { value: 'red', label: 'Errors (red)' },
]

// ---- pure helpers (unit-testable without React) ---------------------------

function jobCount(server, status) {
  return (server.jobs ?? []).filter((job) => (status ? job.status === status : true)).length
}

function matchesQuery(server, query) {
  if (!query) return true
  const needle = query.toLowerCase()
  return (
    server.name.toLowerCase().includes(needle) ||
    (server.jobs ?? []).some((job) => job.name.toLowerCase().includes(needle))
  )
}

function compareServers(a, b, sortBy) {
  if (sortBy === 'active') return jobCount(b, 'green') - jobCount(a, 'green')
  if (sortBy === 'errors') return jobCount(b, 'red') - jobCount(a, 'red')
  return a.name.localeCompare(b.name)
}

/**
 * Group by environment into columns; within each column pinned servers ALWAYS
 * float to the top, and only then is the active sort applied.
 * Exported for unit testing as a pure function.
 */
export function groupServers(servers, { envFilter, statusFilter, query, sortBy }) {
  return ENVIRONMENTS.map((env) => {
    if (envFilter !== 'all' && envFilter !== env) return null
    const visible = servers
      .filter((s) => s.environment === env)
      .filter((s) => (statusFilter === 'all' ? true : jobCount(s, statusFilter) > 0))
      .filter((s) => matchesQuery(s, query))
    const pinned = visible.filter((s) => s.is_pinned).sort((a, b) => compareServers(a, b, sortBy))
    const rest = visible.filter((s) => !s.is_pinned).sort((a, b) => compareServers(a, b, sortBy))
    return { env, pinned, rest }
  }).filter(Boolean)
}

// ---- Dashboard --------------------------------------------------------------

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('live')
  const [query, setQuery] = useState('')
  const [envFilter, setEnvFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('alpha')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // Servers poll always; analytics only while its tab is visible.
  const livePoll = usePolling(fetchServers, POLL_MS)
  const analyticsPoll = usePolling(activeTab === 'analytics' ? fetchAnalytics : null, POLL_MS)

  const servers = livePoll.data ?? []
  const grouped = useMemo(
    () => groupServers(servers, { envFilter, statusFilter, query, sortBy }),
    [servers, envFilter, statusFilter, query, sortBy],
  )
  // v4 G7: groupServers always returns one group per environment, so the
  // "no servers match" empty state must be gated on the TOTAL number of
  // visible servers — otherwise a zero-hit search/filter would render three
  // bare columns and the message could never appear.
  const visibleCount = grouped.reduce((n, g) => n + g.pinned.length + g.rest.length, 0)

  // 1 s clock keeps "Last updated: Xs ago" fresh without re-fetching.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  async function togglePin(server) {
    try {
      if (server.is_pinned) await unpinServer(server.id)
      else await pinServer(server.id)
      await livePoll.refresh() // re-pull so pinned ordering updates immediately
    } catch (err) {
      console.error('Pin toggle failed', err) // banner text comes from the poll error state
    }
  }

  async function handleCreate(newServer) {
    await createServer(newServer) // throws -> AddServerModal shows the detail message
    await livePoll.refresh()
  }

  const secondsAgo = livePoll.lastUpdated
    ? Math.max(0, Math.round((now - livePoll.lastUpdated.getTime()) / 1000))
    : null

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* 10 s progress bar — key={tick} restarts the fill on every completed poll */}
      <div className="mb-4 h-1 overflow-hidden rounded bg-slate-300">
        <div key={livePoll.tick} className="tl-progress h-full rounded bg-emerald-500" />
      </div>

      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Traffic Light · Job Monitoring</h1>
          <p className="text-sm text-slate-500">
            Last updated: {secondsAgo === null ? '…' : `${secondsAgo}s ago`}
            {livePoll.isFetching ? ' · syncing…' : ''}
            {livePoll.error ? ` · ⚠ ${livePoll.error}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          + Add Server
        </button>
      </header>

      {/* Tabs: Live Monitor / Analytics & Health */}
      <nav className="mb-4 inline-flex rounded-lg bg-slate-200 p-1 text-sm font-medium">
        {[
          { id: 'live', label: 'Live Monitor' },
          { id: 'analytics', label: 'Analytics & Health' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
            className={`rounded-md px-4 py-1.5 transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'analytics' ? (
        <AnalyticsView analytics={analyticsPoll.data} servers={servers} />
      ) : (
        <>
          {/* Search / filter / sort controls */}
          <div className="mb-4 grid gap-3 rounded-xl bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
              Search
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Server or job name…"
                data-testid="search"
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
              Environment
              <select
                value={envFilter}
                onChange={(e) => setEnvFilter(e.target.value)}
                data-testid="env-filter"
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
              >
                <option value="all">All environments</option>
                {ENVIRONMENTS.map((env) => (
                  <option key={env} value={env}>
                    {ENV_LABEL[env]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                data-testid="status-filter"
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
              Sort
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                data-testid="sort"
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {visibleCount === 0 && (
            <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center text-slate-400">
              No servers match your filters.
            </div>
          )}

          {/* One column per environment; pinned servers float to the top. */}
          <div className="grid items-start gap-6 lg:grid-cols-3">
            {grouped.map((group) => (
              <section key={group.env} className="rounded-2xl bg-slate-50 p-3">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  <span className={`rounded px-2 py-0.5 text-xs font-bold ${ENV_BADGE[group.env]}`}>
                    {ENV_LABEL[group.env]}
                  </span>
                  <span>{group.pinned.length + group.rest.length}</span>
                </h2>
                <div className="flex flex-col gap-3">
                  {[...group.pinned, ...group.rest].map((server) => (
                    <ServerCard
                      key={server.id}
                      server={server}
                      statusFilter={statusFilter}
                      onTogglePin={togglePin}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {isModalOpen && <AddServerModal onClose={() => setIsModalOpen(false)} onCreate={handleCreate} />}
    </div>
  )
}
