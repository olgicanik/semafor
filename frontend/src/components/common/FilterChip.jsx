/** FilterChip — multi-select status chip (used by EnvironmentHealthSummary / server rows). */
export default function FilterChip({ label, active = false, onClick, count }) {
  return (
    <button
      type="button"
      className={`filter-chip${active ? ' filter-chip--active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      <span>{label}</span>
      {count !== undefined && <span className="filter-chip__count">{count}</span>}
    </button>
  );
}
