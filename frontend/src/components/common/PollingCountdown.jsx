import '../../styles/components/header.css';

/** "Refreshes in Xs" + progress bar. Re-mounts the bar per poll via key=lastUpdated. */
export default function PollingCountdown({ seconds, isRefreshing, lastUpdated }) {
  return (
    <div className="polling-countdown" role="status" aria-live="polite">
      {isRefreshing
        ? <span className="polling-countdown__label">Refreshing…</span>
        : <span className="polling-countdown__label">Refreshes in {seconds}s</span>}
      {lastUpdated && (
        <div className="poll-progress" key={lastUpdated.getTime()} aria-hidden="true">
          <div className="poll-progress__fill" style={{ animationDuration: 'var(--poll-interval)' }} />
        </div>
      )}
    </div>
  );
}
