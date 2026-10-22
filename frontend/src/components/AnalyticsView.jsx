/**
 * AnalyticsView — "Analytics & Health" tab: Uptime %, Failure Rate and System
 * Alerts cards, per-environment uptime bars, the most-unstable server callout,
 * and a placeholder container for historical graphs.
 */

const ALERT_THRESHOLD = 3

function KpiCard({ label, value, hint, tone = 'emerald' }) {
  const tones = { emerald: 'text-emerald-600', rose: 'text-rose-600', amber: 'text-amber-600' }
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${tones[tone] ?? 'text-slate-900'}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </div>
  )
}

export default function AnalyticsView({ analytics, servers = [] }) {
  const envUptimes = analytics?.average_uptime_per_environment ?? []
  const uptimeAvg = envUptimes.length
    ? envUptimes.reduce((sum, u) => sum + u.average_uptime_percent, 0) / envUptimes.length
    : 0

  // System Alerts are derived live from the polled servers (red jobs right now).
  const activeRedJobs = servers.reduce(
    (total, s) => total + (s.jobs ?? []).filter((job) => job.status === 'red').length,
    0,
  )
  const alertLevel = activeRedJobs >= ALERT_THRESHOLD ? 'Critical' : activeRedJobs > 0 ? 'Warning' : 'Healthy'
  const alertTone = alertLevel === 'Healthy' ? 'emerald' : alertLevel === 'Warning' ? 'amber' : 'rose'

  // The backend returns the most-unstable server id; surface its display name.
  const unstableId = analytics?.most_unstable_server
  const unstableName = servers.find((s) => s.id === unstableId)?.name ?? unstableId

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Uptime" value={`${uptimeAvg.toFixed(1)}%`} hint="avg across environments" />
        <KpiCard
          label="Failure Rate"
          value={`${analytics?.failure_rate_percent ?? 0}%`}
          hint="red transitions, last 24 h"
          tone="rose"
        />
        <KpiCard label="System Alerts" value={String(activeRedJobs)} hint={`status: ${alertLevel}`} tone={alertTone} />
      </div>

      {/* Per-environment uptime detail */}
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Uptime by environment
        </h3>
        {envUptimes.length > 0 ? (
          <ul className="space-y-2">
            {envUptimes.map((u) => (
              <li key={u.environment} className="flex items-center gap-3 text-sm">
                <span className="w-16 font-medium text-slate-600">{u.environment}</span>
                <div className="h-2 flex-1 overflow-hidden rounded bg-slate-100">
                  <div
                    className="h-full rounded bg-emerald-500"
                    style={{ width: `${u.average_uptime_percent}%` }}
                  />
                </div>
                <span className="w-14 text-right text-slate-500">{u.average_uptime_percent}%</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No analytics data yet.</p>
        )}
      </div>

      {/* Most-unstable server callout */}
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Most unstable server
        </h3>
        <p className="text-sm text-slate-600">
          {unstableName
            ? `Server "${unstableName}" has the most red state transitions.`
            : 'No red transitions recorded yet — everything looks stable.'}
        </p>
      </div>

      {/* Historical graphs placeholder */}
      {/* INTEGRATE RECHARTS/CHART.JS HERE FOR HISTORICAL GRAPHS */}
      <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
        <p className="text-sm font-medium">Historical graphs</p>
        <p className="mt-1 text-xs">
          Recharts / Chart.js goes here: per-server uptime over time, red-error timeline, …
        </p>
      </div>
    </div>
  )
}
