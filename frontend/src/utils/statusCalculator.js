/**
 * statusCalculator.js — pure, dependency-free semaphore engine.
 * Single source of truth for the green/orange/red rules (task §5) and the
 * adapter between the live backend wire model and the frontend vocabulary.
 */
export const STATUS = Object.freeze({ GREEN: 'green', ORANGE: 'orange', RED: 'red' });

/** Worst-first sort order (lower index = worse); null/unknown sorts last. */
export const STATUS_ORDER = Object.freeze([STATUS.RED, STATUS.ORANGE, STATUS.GREEN]);

export const STATUS_LABEL = Object.freeze({
  green: 'Healthy',
  orange: 'Warning',
  red: 'Critical',
});

export const STATUS_OPTIONS = Object.freeze([
  { value: 'all',   label: 'All statuses' },
  { value: 'green', label: 'Healthy (Green)' },
  { value: 'orange', label: 'Warning (Orange)' },
  { value: 'red',   label: 'Critical (Red)' },
]);

const RAW_READY_RE = /ready to run/i;
const RAW_ERRORED_RE = /ended with errors/i;
const RAW_HEALTHY_RE = /^running|^done|^success|^completed/i;
const WARN_HINT_RE = /killed by user|timeout/i;

/**
 * §5 calculation over a Talend-flavored raw payload.
 *   green  : "Ready to run" and no error message (also accepts running/done/success w/o error).
 *   orange : "Ended with errors" and message hints "Killed by user"/"Timeout" (case-insensitive).
 *   red    : "Ended with errors" and not orange (connection refused, schema mismatch, ...).
 *   null   : unrecognised raw status ("Planning", "Paused", "Aborted") OR "Ready to run" w/ an
 *            error message present (NSString §5: green requires NO error message; stay muted).
 */
export function calculateJobStatus({ rawStatus, errorMessage } = {}) {
  const raw = typeof rawStatus === 'string' ? rawStatus.trim() : '';
  const err = typeof errorMessage === 'string' ? errorMessage.trim() : '';

  if (RAW_ERRORED_RE.test(raw)) {
    return WARN_HINT_RE.test(err) ? STATUS.ORANGE : STATUS.RED;
  }
  if (RAW_READY_RE.test(raw) && err === '') return STATUS.GREEN;
  if (RAW_HEALTHY_RE.test(raw) && err === '') return STATUS.GREEN;
  return null;
}

/**
 * Backend wire "green|yellow|red" -> frontend "green|orange|red".
 * Idempotent over the FRONTEND vocabulary too (green/orange/red pass through) so it is safe to
 * run on already-normalized views. Unknown values -> null (never passed through).
 */
export function mapWireStatus(status) {
  if (status === 'yellow') return STATUS.ORANGE;
  if (status === STATUS.GREEN || status === STATUS.ORANGE || status === STATUS.RED) return status;
  return null;
}

/** §5 server rollup: RED if any red; else ORANGE if any orange; else GREEN iff no job is below healthy. */
export function serverHealth(jobs = []) {
  const statuses = (jobs ?? []).map((j) => j.status).filter(Boolean);
  if (statuses.length === 0) return null;                 // no known status -> muted
  if (statuses.includes(STATUS.RED)) return STATUS.RED;
  if (statuses.includes(STATUS.ORANGE)) return STATUS.ORANGE;
  return STATUS.GREEN;
}

/** Counter pills for ServerMetrics: { total, healthy, warning, critical }. */
export function countByStatus(jobs = []) {
  const counts = { total: jobs.length, healthy: 0, warning: 0, critical: 0 };
  for (const job of jobs ?? []) {
    if (job.status === STATUS.RED) counts.critical += 1;
    else if (job.status === STATUS.ORANGE) counts.warning += 1;
    else if (job.status === STATUS.GREEN) counts.healthy += 1;
  }
  return counts;
}

/** severityRank: null/unknown sorts after GREEN (never worse than red — see hook sort). */
export const severityRank = (status) =>
  status != null && STATUS_ORDER.includes(status) ? STATUS_ORDER.indexOf(status) : STATUS_ORDER.length;

/** Backend wire Job -> JobView (rawStatus stays null; message becomes errorMessage). */
export function toJobView(job = {}) {
  return {
    id: job.id ?? null,
    name: job.name ?? 'Untitled job',
    project: job.project ?? null,
    status: job.status != null ? mapWireStatus(job.status) : null, // unknown -> null (muted)
    rawStatus: typeof job.rawStatus === 'string' ? job.rawStatus : null,
    errorMessage:
      typeof job.errorMessage === 'string' ? job.errorMessage
      : typeof job.message === 'string' ? job.message : '',
    lastRun: job.last_run ?? job.lastRun ?? null,
  };
}

/** Backend wire Server -> ServerView (jobs normalized; health computed on render). */
export function toServerView(server = {}) {
  const view = { ...server, jobs: (server.jobs ?? []).map(toJobView) };
  view.health = serverHealth(view.jobs);
  return view;
}
