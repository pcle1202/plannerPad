import React from 'react';
import { ConnectionBadge } from 'plannerpad';

export function Connected() {
  return <ConnectionBadge status="connected" online={true} />;
}

export function Reconnecting() {
  return <ConnectionBadge status="connecting" online={true} />;
}

export function Offline() {
  return <ConnectionBadge status="disconnected" online={false} />;
}
