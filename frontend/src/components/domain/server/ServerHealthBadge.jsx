import SemaphoreDot from '../../common/SemaphoreDot.jsx';
import { serverHealth, STATUS_LABEL } from '../../../utils/statusCalculator.js';
import '../../../styles/components/badge.css';

/** Aggregated server traffic-light badge based on its job statuses. */
export default function ServerHealthBadge({ jobs = [] }) {
  const health = serverHealth(jobs);
  const tone = health ? `badge--${health}` : 'badge--muted';
  const label = health ? (STATUS_LABEL[health] ?? 'Unknown') : 'Muted';
  return (
    <span className={`badge ${tone}`}>
      <SemaphoreDot status={health} pulse={false} size="sm" />
      <span>{label}</span>
    </span>
  );
}
