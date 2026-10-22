import { useState } from 'react';
import Supergraphic from '../../common/Supergraphic.jsx';
import EnvironmentBadge from '../environment/EnvironmentBadge.jsx';
import '../../../styles/components/server-card.css';

/**
 * ServerHeader — server title (name), monospace address (server.id, the "IP" slot),
 * a copy button, the EnvironmentBadge and children (pin toggle / health badge slots).
 */
export default function ServerHeader({ server, children }) {
  const [copied, setCopied] = useState(false);
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(server.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <>
      <Supergraphic />
      <div className="server-card__header">
        <div className="server-card__title-block">
          <h3 className="server-card__title">{server.name}</h3>
        </div>
        <div className="server-card__head-actions">
          <span className="server-card__addr" data-mono>{server.id}</span>
          <button type="button" className="server-card__copy" data-testid="copy-address" onClick={copyAddress}
                  aria-label={`Copy address for ${server.name}`}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <EnvironmentBadge env={server.environment} />
          {children}
        </div>
      </div>
    </>
  );
}
