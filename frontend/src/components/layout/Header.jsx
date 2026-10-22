import SearchBar from '../common/SearchBar.jsx';
import PollingCountdown from '../common/PollingCountdown.jsx';
import PlatformBadge from '../domain/platform/PlatformBadge.jsx';
import { STATUS_OPTIONS } from '../../utils/statusCalculator.js';
import { SORT_KEYS } from '../../hooks/useServerFilterAndSort.js';
import '../../styles/components/header.css';

const SORT_OPTIONS = [
  { value: SORT_KEYS.NAME, label: 'Name (A–Z)' },
  { value: SORT_KEYS.SEVERITY, label: 'Severity' },
];

/**
 * Heading — brand navbar: wordmark, PlatformBadge, PollingCountdown, SearchBar,
 * status filter, sort select, refresh button and Add Server.
 */
export default function Header({
  platform,
  searchValue, onSearch,
  statusFilter, onStatusFilter,
  sortBy, onSortBy,
  seconds, isRefreshing, lastUpdated, onRefresh,
  onAddServer,
}) {
  return (
    <header className="app-header">
      <div className="app-header__bar">
        <span className="app-header__wordmark">{platform.name}</span>
        <PlatformBadge />
        <PollingCountdown seconds={seconds} isRefreshing={isRefreshing} lastUpdated={lastUpdated} />
        <div className="app-header__controls">
          <SearchBar value={searchValue} onChange={onSearch} />
          <label className="select-label">
            <span className="select-label__text">Status</span>
            <select className="select-control" data-testid="status-filter" value={statusFilter}
                    onChange={(e) => onStatusFilter(e.target.value)}>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label className="select-label">
            <span className="select-label__text">Sort</span>
            <select className="select-control" data-testid="sort" value={sortBy}
                    onChange={(e) => onSortBy(e.target.value)}>
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          <button type="button" className="refresh-btn" data-testid="refresh"
                  disabled={isRefreshing} onClick={onRefresh}>
            Refresh
          </button>
          <button type="button" className="add-server-btn" data-testid="add-server" onClick={onAddServer}>
            + Add server
          </button>
        </div>
      </div>
    </header>
  );
}
