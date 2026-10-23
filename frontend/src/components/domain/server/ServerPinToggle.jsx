import '../../../styles/components/server-card.css';

/**
 * ServerPinToggle — single icon-only pin button.
 * Outline + muted gray (#94A3B8) when unpinned; filled + Bosch dark blue (#005691)
 * when pinned. Accessible name flips between "Pin server" / "Unpin server"; the
 * `title` is the tooltip ("Pin to top" / "Unpin server"). Pure presentational;
 * `pinned` comes from the parent (ServerCard wires onToggle → onTogglePin(server.id)).
 */
function PinIcon() {
  return (
    <svg className="server-pin-btn__icon" width="14" height="14" viewBox="0 0 24 24"
         aria-hidden="true" focusable="false">
      <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
    </svg>
  );
}

export default function ServerPinToggle({ pinned = false, onToggle }) {
  return (
    <button
      type="button"
      className={`server-pin-btn${pinned ? ' server-pin-btn--pinned' : ''}`}
      aria-pressed={pinned}
      aria-label={pinned ? 'Unpin server' : 'Pin server'}
      title={pinned ? 'Unpin server' : 'Pin to top'}
      onClick={onToggle}
    >
      <PinIcon />
    </button>
  );
}
