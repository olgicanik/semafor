import { STATUS_LABEL } from '../../../utils/statusCalculator.js';
import '../../../styles/components/badge.css';

/** Status chip with tooltip + error details; opens the JobErrorDrawer when onShowError is set. */
export default function JobStatusBadge({ status, rawStatus, errorMessage, onShowError }) {
  const label = status ? (STATUS_LABEL[status] ?? 'Unknown') : 'Unknown';
  const tone = status ? `badge--${status}` : 'badge--muted';
  const cls = `badge ${tone}${onShowError ? ' badge--button' : ''}`;
  const clickable = typeof onShowError === 'function';
  return (
    clickable ? (
      <button
        type="button"
        className={cls}
        title={errorMessage || rawStatus || label}
        onClick={() => onShowError()}
      >
        <span>{label}</span>
      </button>
    ) : (
      <span className={cls} title={errorMessage || rawStatus || label}>
        <span>{label}</span>
      </span>
    )
  );
}
