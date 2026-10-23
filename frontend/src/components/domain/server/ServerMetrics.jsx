import SemaphoreDot from '../../common/SemaphoreDot.jsx';
import { countByStatus } from '../../../utils/statusCalculator.js';
import '../../../styles/components/server-card.css';

/** Counter pills for a server: Total / Healthy (green) / Warning (orange) / Critical (red). */
export default function ServerMetricsSummary({ jobs = [] }) {
  const counts = countByStatus(jobs);
  const pills = [
    { label: 'Total', count: counts.total, status: null },
    { label: 'Healthy', count: counts.healthy, status: 'green' },
    { label: 'Warning', count: counts.warning, status: 'orange' },
    { label: 'Critical', count: counts.critical, status: 'red' },
  ];
  return (
    <div className="server-metrics">
      {pills.map(({ label, count, status }) => (
        <span key={label} className="server-metrics__pill">
          {status && <SemaphoreDot status={status} pulse={false} size="sm" />}
          {label} <span className="server-metrics__count">{count}</span>
        </span>
      ))}
    </div>
  );
}

export { ServerMetricsSummary };
