/**
 * ServerCard — one server with a semaphore of its jobs. Each job gets a
 * traffic-light dot (bright green / warning yellow / error red) that pulses
 * while active. Status filtering is applied at the job level here so
 * "show only red" renders exactly the red jobs.
 */

const PULSE_CLASS = { green: 'tl-green', yellow: 'tl-yellow', red: 'tl-red' }

function TrafficLightDot({ status }) {
  return (
    <span
      aria-hidden
      data-status={status}
      className={`tl-light inline-block h-3 w-3 shrink-0 rounded-full ${PULSE_CLASS[status] ?? 'tl-dim'}`}
    />
  )
}

function JobRow({ job }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <TrafficLightDot status={job.status} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-700">{job.name}</p>
        <p className="truncate text-xs text-slate-400">{job.message}</p>
      </div>
      <time className="shrink-0 text-xs text-slate-400">
        {job.last_run ? new Date(job.last_run).toLocaleString() : '—'}
      </time>
    </li>
  )
}

export default function ServerCard({ server, statusFilter = 'all', onTogglePin }) {
  const { id, name, environment, auth_type, is_pinned, jobs = [] } = server
  const visibleJobs =
    statusFilter === 'all' ? jobs : jobs.filter((job) => job.status === statusFilter)
  const activeCount = jobs.filter((job) => job.status === 'green').length
  const errorCount = jobs.filter((job) => job.status === 'red').length

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-slate-800">{name}</h3>
          <p className="text-xs text-slate-400">
            {environment} · {auth_type}
            {is_pinned && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                pinned
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onTogglePin(server)}
          aria-pressed={is_pinned}
          className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
            is_pinned
              ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
              : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
          {is_pinned ? 'Unpin' : 'Pin'}
        </button>
      </header>

      <div className="mb-2 flex gap-3 text-xs text-slate-400">
        <span>{activeCount} active</span>
        <span>{errorCount} errors</span>
      </div>

      {visibleJobs.length > 0 ? (
        <ul className="divide-y divide-slate-100">
          {visibleJobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </ul>
      ) : (
        <p className="py-3 text-center text-sm text-slate-400">
          {statusFilter === 'all' ? 'No jobs yet.' : `No ${statusFilter} jobs.`}
        </p>
      )}
    </article>
  )
}
