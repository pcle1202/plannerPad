import React from 'react';

/**
 * Real-time connection status pill. Shows a colored dot + label.
 * `status`: 'connected' | 'connecting' | 'disconnected'
 * `online`: browser navigator.onLine value
 */
export function ConnectionBadge({ status = 'connected', online = true }) {
  const effective = !online ? 'disconnected' : status;
  const LABELS = {
    connected: 'Connected',
    connecting: 'Reconnecting...',
    disconnected: 'Offline',
  };
  return (
    <div className={`conn conn--${effective}`}>
      <span className="conn__dot" />
      <span className="conn__label">{LABELS[effective] ?? effective}</span>
    </div>
  );
}
