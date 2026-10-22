import '../styles/components/analytics.css'
import '../styles/components/badge.css'

/**
 * AnalyticsView — "Analytics & Health" tab: Uptime %, Failure Rate and System
 * Alerts cards, per-environment uptime bars, the most-unstable server callout,
 * and a placeholder container for historical graphs.
 */

const ALERT_THRESHOLD = 3

function KpiCard({ label, value, hint, tone = 'green' }) {
  const tones = { green: 'kpi kpi--green', rose: 'kpi kpi--red', amber: 'kpi kpi--amber' }
  return (
    <div className={tones[tone] ?? 'kpi'}>
      <p className="kpi__label">{label}</p>
      <p className="kpi__value">{value}</p>
      <p className="kpi__hint">{hint}</p>
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
  const alertTone = alertLevel === 'Healthy' ? 'green' : alertLevel === 'Warning' ? 'amber' : 'rose'

  // The backend returns the most-unstable server id; surface its display name.
  const unstableId = analytics?.most_unstable_server
  const unstableName = servers.find((s) => s.id === unstableId)?.name ?? unstableId

  return (
    <div className="analytics">
      {/* KPI cards */}
      <div className="analytics__kpis">
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
      <div className="analytics__card">
        <h3 className="analytics__subheading">
          Uptime by environment
        </h3>
        {envUptimes.length > 0 ? (
          <ul className="analytics__bars">
            {envUptimes.map((u) => (
              <li key={u.environment} className="analytics__bar">
                <span className="analytics__bar-label">{u.environment}</span>
                <div className="analytics__bar-track">
                  <div
                    className="analytics__bar-fill"
                    style={{ width: `${u.average_uptime_percent}%` }}
                  />
                </div>
                <span className="analytics__bar-value" data-mono>{u.average_uptime_percent}%</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="analytics__muted">No analytics data yet.</p>
        )}
      </div>

      {/* Most-unstable server callout */}
      <div className="analytics__card">
        <h3 className="analytics__subheading">
          Most unstable server
        </h3>
        <p className="analytics__body">
          {unstableName
            ? `Server "${unstableName}" has the most red state transitions.`
            : 'No red transitions recorded yet — everything looks stable.'}
        </p>
      </div>

      {/* Historical graphs placeholder */}
      {/* INTEGRATE RECHARTS/CHART.JS HERE FOR HISTORICAL GRAPHS */}
      <div className="analytics__placeholder">
        <p className="analytics__placeholder-title">Historical graphs</p>
        <p className="analytics__placeholder-sub">
          Recharts / Chart.js goes here: per-server uptime over time, red-error timeline, …
        </p>
      </div>
    </div>
  )
}
