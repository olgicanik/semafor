import '../../../styles/components/server-card.css';

/**
 * ServerPinToggle — standalone pin button. Accessible name stays 'Pin'/'Unpin'
 * so the migrated test queries by button name keep passing. Pure presentational.
 */
export default function ServerPinToggle({ pinned = false, onToggle, label }) {
  return (
    <button
      type="button"
      className={`pin-toggle${pinned ? ' pin-toggle--pinned' : ''}`}
      aria-pressed={pinned}
      aria-label={label}
      onClick={onToggle}
    >
      {pinned ? 'Unpin' : 'Pin'}
    </button>
  );
}
