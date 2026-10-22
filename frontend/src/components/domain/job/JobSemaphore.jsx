import SemaphoreDot from '../../common/SemaphoreDot.jsx';

/**
 * JobSemaphore — takes exactly { rawStatus, errorMessage, calculatedStatus } (task §1A)
 * and renders the traffic-light indicator for a job; purely presentational.
 */
export default function JobSemaphore({ rawStatus, errorMessage, calculatedStatus }) {
  return <SemaphoreDot status={calculatedStatus} aria-label={errorMessage ? `${calculatedStatus}: ${errorMessage}` : undefined} />;
}
