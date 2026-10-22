import { useEffect, useState } from 'react';
import '../../styles/components/header.css';

function useDebouncedValue(value, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** Debounced search input. Controlled: emits the debounced value via onChange. */
export default function SearchBar({ value, onChange, placeholder = 'Search servers, jobs, IPs…' }) {
  const deferred = useDebouncedValue(value);
  useEffect(() => { onChange(deferred); }, [deferred]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      className="search-bar"
      data-testid="search"
      type="search"
      aria-label="Search servers and jobs"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
