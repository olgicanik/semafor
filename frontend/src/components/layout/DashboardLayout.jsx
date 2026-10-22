import Supergraphic from '../common/Supergraphic.jsx';
import PlatformHeader from '../domain/platform/PlatformHeader.jsx';
import EnvironmentTabs from '../domain/environment/EnvironmentTabs.jsx';
import ServerCard from '../domain/server/ServerCard.jsx';
import { ENV_ALL, ENV_PINNED } from '../../utils/constants.js';
import '../../styles/components/dashboard.css';

export default function DashboardLayout({
  environments, counts, activeEnv, onEnvChange, pinnedServers, servers, onTogglePin,
  onShowServerErrors, statusFilter = 'all', empty,
}) {
  return (
    <div className="dashboard">
      <Supergraphic />
      <PlatformHeader environments={environments} servers={servers} />
      <EnvironmentTabs active={activeEnv} counts={counts} onChange={onEnvChange} />
      {empty ? (
        <div className="dashboard__empty" role="status">No servers match your filters.</div>
      ) : (
        <div className="dashboard__grid">
          {envGroups(environments, servers).map(({ env, items }) => (
            <section key={env} className="dashboard__group" data-testid={`group-${env}`}>
              <header className="dashboard__group-head">
                <h2 className="dashboard__group-title">{groupTitle(env)}</h2>
                <span className="dashboard__group-count">{items.length} server{items.length === 1 ? '' : 's'}</span>
              </header>
              {items.map((server) => (
                <ServerCard key={server.id} server={server}
                            pinned={pinnedServers.includes(server.id)}
                            onTogglePin={onTogglePin}
                            onShowServerErrors={onShowServerErrors}
                            statusFilter={statusFilter} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** Pure helpers, exported for unit tests. */
export function groupTitle(env) {
  if (env === 'all') return 'All environments';
  if (env === 'pinned') return 'Pinned servers';
  return env.toUpperCase();
}
export function envGroups(environments, servers) {
  // 'all' and 'pinned' are single-group views: the servers list is already
  // full (all) or pin-filtered (pinned) upstream, so one group renders.
  if (environments.length === 0 || environments[0] === ENV_ALL || environments[0] === ENV_PINNED) {
    return [{ env: environments[0] ?? ENV_ALL, items: servers }];
  }
  return environments.map((env) => ({ env, items: servers.filter((s) => s.environment === env) }));
}
