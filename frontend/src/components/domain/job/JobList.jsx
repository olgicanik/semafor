import { useState } from 'react';
import JobRow from './JobRow.jsx';
import '../../../styles/components/job-row.css';

/**
 * JobList — sortable, collapsible job container. Jobs render in the order received
 * (already server-level sorted by the filter hook, red-first). Collapse is local UI state.
 */
export default function JobList({ jobs = [], onShowError, emptyText = 'No jobs yet.' }) {
  const [collapsed, setCollapsed] = useState(false);
  if (jobs.length === 0) {
    return <p className="job-list__empty">{emptyText}</p>;
  }
  return (
    <div className="job-list">
      <button type="button" className="job-list__head" onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}>
        <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
        <span>{jobs.length} job{jobs.length === 1 ? '' : 's'}</span>
      </button>
      {!collapsed && (
        <ul className="job-list">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} onShowError={onShowError} />
          ))}
        </ul>
      )}
    </div>
  );
}
