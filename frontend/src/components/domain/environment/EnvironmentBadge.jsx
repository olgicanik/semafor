import { ENV_LABEL } from '../../../utils/constants.js';
import '../../../styles/components/environment.css';

/** Small pill for DEV / QA / PROD (renders uppercase labels). */
export default function EnvironmentBadge({ env }) {
  const normalized = ENV_LABEL[env] ? env : 'all';
  return <span className={`env-badge env-badge--${normalized}`}>{ENV_LABEL[env] ?? env}</span>;
}
