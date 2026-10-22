import { PLATFORM } from '../../../utils/constants.js';
import '../../../styles/components/badge.css';

/** Visual tag identifying the platform (e.g. "Talend TAC - SL3/SL4"). */
export default function PlatformBadge() {
  return <span className="badge badge--blue">{PLATFORM.label}</span>;
}
