import '../../styles/components/semaphore.css';

/** Configurable pulsing indicator dot (green/orange/red/muted). */
export default function SemaphoreDot({ status, pulse = true, size = 'md', label }) {
  const statusClass = status ? `sema-dot--${status}` : 'sema-dot--muted';
  const cls = [`sema-dot`, statusClass, pulse && status ? 'sema-dot--pulse' : '', `sema-dot--${size}`]
    .filter(Boolean).join(' ');
  return (
    <span className={cls} data-status={status ?? 'muted'} role="img"
          aria-label={label ?? (status ? `Status: ${status}` : 'Status: unknown')} />
  );
}
