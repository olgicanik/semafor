import Supergraphic from '../../common/Supergraphic.jsx';
import PlatformBadge from './PlatformBadge.jsx';
import EnvironmentHealthSummary from '../environment/EnvironmentHealthSummary.jsx';
import { PLATFORM } from '../../../utils/constants.js';

/**
 * Hero block for the dashboard: supergraphic + platform name/zone + badge,
 * plus an environment-health summary slot (rendered when servers are available).
 */
export default function PlatformHeader({ environments = [], servers }) {
  return (
    <div className="platform-header">
      <Supergraphic />
      <div className="platform-header__row">
        <h1 className="platform-header__title">{PLATFORM.name}</h1>
        <span className="platform-header__zone" data-mono>{PLATFORM.zone}</span>
        <PlatformBadge />
      </div>
      {environments.length > 0 && (
        <div className="platform-header__envs">
          {environments.map((env) => <span key={env} className="platform-header__env">{env}</span>)}
        </div>
      )}
      {servers && <EnvironmentHealthSummary servers={servers} />}
    </div>
  );
}
