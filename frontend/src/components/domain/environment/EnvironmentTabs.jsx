import { ENVIRONMENTS, ENV_ALL, ENV_PINNED, ENV_LABEL } from '../../../utils/constants.js';
import '../../../styles/components/tabs.css';

/** Tab switcher: All / DEV / QA / PROD / Pinned, with live server counts. */
export default function EnvironmentTabs({ active, counts = {}, onChange }) {
  const tabs = [
    { value: ENV_ALL, label: 'All' },
    ...ENVIRONMENTS.map((env) => ({ value: env, label: ENV_LABEL[env] })),
    { value: ENV_PINNED, label: 'Pinned' },
  ];
  return (
    <nav className="env-tabs" role="tablist" aria-label="Environment">
      {tabs.map((tab) => (
        <button key={tab.value} role="tab" aria-selected={active === tab.value}
                className={`env-tab${active === tab.value ? ' env-tab--active' : ''}`}
                data-testid={`env-tab-${tab.value}`}
                onClick={() => onChange(tab.value)}>
          {tab.label}
          <span className="env-tab__count">{counts[tab.value] ?? 0}</span>
        </button>
      ))}
    </nav>
  );
}
