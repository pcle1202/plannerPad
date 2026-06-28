import React, { useRef, useEffect } from 'react';
import { RoomMenu } from 'plannerpad';

/* Open state — useEffect clicks the trigger after mount */
export function MenuOpen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const btn = ref.current?.querySelector<HTMLButtonElement>('.room-menu__trigger');
    btn?.click();
  }, []);
  return (
    <div ref={ref} style={{ padding: '8px 12px' }}>
      <RoomMenu />
    </div>
  );
}

export function Trigger() {
  return (
    <div style={{ padding: '8px 12px' }}>
      <RoomMenu />
    </div>
  );
}
