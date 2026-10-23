import { useMemo } from 'react';
import SemaphoreDot from '../../common/SemaphoreDot.jsx';
import { serverHealth, severityRank, STATUS } from '../../../utils/statusCalculator.js';
import { ENVIRONMENTS, ENV_LABEL } from '../../../utils/constants.js';
import '../../../styles/components/environment.css';

/** Worst status wins (lower rank = worse). */
function envHealth(servers) {
  const worst = Math.min(...servers.map((s) => severityRank(s.health ?? null)));
  return worst === Infinity ? null : [STATUS.RED, STATUS.ORANGE, STATUS.GREEN][worst];
}

/**
 * EnvironmentHealthSummary — aggregated server counts and a global status dot
 * per environment (worst server health across the env).
 */
export default function EnvironmentHealthSummary({ servers = [] }) {
  const perEnv = useMemo(() => ENVIRONMENTS.map((env) => {
    const items = servers.filter((s) => s.environment === env);
    return { env, label: ENV_LABEL[env], items };
  }), [servers]);
  return (
    <div className="env-health">
      {perEnv.map(({ env, label, items }) => {
        const health = items.length ? envHealth(items) : null;
        const reds = items.filter((s) => serverHealth(s.jobs) === STATUS.RED).length;
        const oranges = items.filter((s) => serverHealth(s.jobs) === STATUS.ORANGE).length;
        return (
          <span key={env} className="env-health__item">
            <SemaphoreDot status={health} pulse={false} size="sm" />
            <strong>{label}</strong>
            <span>{items.length} servers{reds ? ` · ${reds} red` : ''}{oranges ? ` · ${oranges} warn` : ''}</span>
          </span>
        );
      })}
    </div>
  );
}
