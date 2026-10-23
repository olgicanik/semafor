// components/index.js — public component API barrel (one-line imports per domain).
export { default as Supergraphic } from './common/Supergraphic.jsx';
export { default as SemaphoreDot } from './common/SemaphoreDot.jsx';
export { default as SearchBar } from './common/SearchBar.jsx';
export { default as FilterChip } from './common/FilterChip.jsx';
export { default as PollingCountdown } from './common/PollingCountdown.jsx';

export { default as JobStatusBadge } from './domain/job/JobStatusBadge.jsx';
export { default as JobSemaphore } from './domain/job/JobSemaphore.jsx';
export { default as JobRow } from './domain/job/JobRow.jsx';
export { default as JobList } from './domain/job/JobList.jsx';
export { default as JobErrorDrawer, hintForError } from './domain/job/JobErrorDrawer.jsx';

export { default as ServerCard } from './domain/server/ServerCard.jsx';
export { default as ServerHeader } from './domain/server/ServerHeader.jsx';
export { default as ServerMetricsSummary } from './domain/server/ServerMetrics.jsx';
export { default as ServerHealthBadge } from './domain/server/ServerHealthBadge.jsx';
export { default as ServerPinToggle } from './domain/server/ServerPinToggle.jsx';

export { default as EnvironmentBadge } from './domain/environment/EnvironmentBadge.jsx';
export { default as EnvironmentTabs } from './domain/environment/EnvironmentTabs.jsx';
export { default as EnvironmentHealthSummary } from './domain/environment/EnvironmentHealthSummary.jsx';

export { default as PlatformBadge } from './domain/platform/PlatformBadge.jsx';
export { default as PlatformHeader } from './domain/platform/PlatformHeader.jsx';

export { default as Header } from './layout/Header.jsx';
export { default as DashboardLayout, groupTitle, envGroups } from './layout/DashboardLayout.jsx';
