import ServerHeader from './ServerHeader.jsx';
import ServerMetricsSummary from './ServerMetrics.jsx';
import ServerHealthBadge from './ServerHealthBadge.jsx';
import ServerPinToggle from './ServerPinToggle.jsx';
import JobList from '../job/JobList.jsx';
import '../../../styles/components/server-card.css';

/**
 * ServerCard — composable server presenter. Owns NO data logic; delegates:
 * header -> ServerHeader, rollup -> ServerHealthBadge, counters -> ServerMetrics,
 * pin -> ServerPinToggle, jobs -> JobList, status -> serverHealth() (statusCalculator).
 */
export default function ServerCard({
  server, pinned, onTogglePin, onShowServerErrors, statusFilter = 'all',
}) {
  const visibleJobs = statusFilter === 'all'
    ? server.jobs : server.jobs.filter((job) => job.status === statusFilter);
  return (
    <article className={`server-card server-card--${server.health ?? 'muted'}`} data-testid={`server-${server.id}`}>
      <ServerHeader server={server}>
        <ServerHealthBadge jobs={server.jobs} />
        {pinned && <span className="server-card__pinned">pinned</span>}
        <ServerPinToggle pinned={pinned} onToggle={() => onTogglePin(server.id)} label={pinned ? 'Unpin' : 'Pin'} />
      </ServerHeader>
      <ServerMetricsSummary jobs={server.jobs} />
      <JobList jobs={visibleJobs}
               onShowError={onShowServerErrors}
               emptyText={statusFilter === 'all' ? 'No jobs yet.' : `No ${statusFilter} jobs.`} />
    </article>
  );
}
