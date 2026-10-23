import JobStatusBadge from './JobStatusBadge.jsx';
import '../../../styles/components/error-drawer.css';

/** Pure hint helper — unit-tested. Returns a guidance string for a known failure signature. */
export function hintForError(message = '') {
  const m = String(message);
  if (/server|connect|refused|unreachable/i.test(m)) return 'Network: check connectivity to the target.';
  if (/timeout/i.test(m)) return 'Increase the timeout budget or reduce queue wait.';
  if (/schema|column|type/i.test(m)) return 'Schema drift — compare column types between source and target.';
  if (/kill/i.test(m)) return 'Manually terminated — verify the operator intent.';
  return 'No automated hint — inspect the raw error log below.';
}

/**
 * JobErrorDrawer — modular right slide-over showing the raw error log, failure
 * timestamp and root-cause hints for a failed job. Rendered once at the app root.
 */
export default function JobErrorDrawer({ job, onClose }) {
  if (!job) return null;
  const status = job.status ?? null;
  return (
    <>
      <div className="error-drawer__backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="error-drawer" role="dialog" aria-modal="true" aria-label={`Error details for ${job.name ?? 'job'}`}>
        <header className="error-drawer__head">
          <h2 className="error-drawer__title">{job.name ?? 'Untitled job'}</h2>
          <button type="button" className="error-drawer__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="error-drawer__body">
          <div>
            <p className="error-drawer__label">Status</p>
            <JobStatusBadge status={status} rawStatus={job.rawStatus} errorMessage={job.errorMessage} />
          </div>
          {job.lastRun && (
            <div>
              <p className="error-drawer__label">Failed at</p>
              <p className="error-drawer__mono" data-mono>{new Date(job.lastRun).toLocaleString()}</p>
            </div>
          )}
          <div>
            <p className="error-drawer__label">Raw error log</p>
            <pre className="error-drawer__mono" data-mono>{job.errorMessage || '(no error message)'}</pre>
          </div>
          <p className="error-drawer__hint">{hintForError(job.errorMessage)}</p>
        </div>
      </aside>
    </>
  );
}
