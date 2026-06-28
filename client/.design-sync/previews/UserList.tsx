import React from 'react';
import { UserList } from 'plannerpad';

export function ThreeUsers() {
  return (
    <UserList
      users={[
        { name: 'Alice', color: '#F9A8D4' },
        { name: 'Bob',   color: '#C084FC' },
        { name: 'Carol', color: '#93C5FD' },
      ]}
    />
  );
}

export function SoloUser() {
  return (
    <UserList users={[{ name: 'Alice', color: '#F9A8D4' }]} />
  );
}
