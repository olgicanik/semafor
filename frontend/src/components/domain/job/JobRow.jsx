import SemaphoreDot from '../../common/SemaphoreDot.jsx';
import JobStatusBadge from './JobStatusBadge.jsx';
import '../../../styles/components/job-row.css';

/**
 * JobRow — a standalone, context-free job presenter.
 * Renders the job semaphore, name, project, mono id, error hint and timestamp.
 */
export default function JobRow({ job, onShowError, compact = false, timestamp = true }) {
  const { id, name, project, status, rawStatus, errorMessage, lastRun } = job ?? {};
  return (
    <li className={`job-row${compact ? ' job-row--compact' : ''}`}>
      <SemaphoreDot status={status} size={compact ? 'sm' : 'md'} />
      <div className="job-row__main">
        <span className="job-row__name">{name}</span>
        {project && <span className="job-row__project">{project}</span>}
        {!compact && <span className="job-row__id" data-mono>{id}</span>}
      </div>
      <JobStatusBadge status={status} rawStatus={rawStatus} errorMessage={errorMessage}
                      onShowError={onShowError ? () => onShowError(job) : undefined} />
      {timestamp && lastRun && <time className="job-row__time" dateTime={lastRun}>
        {new Date(lastRun).toLocaleString()}</time>}
    </li>
  );
}
