import React from 'react';
import { Button } from 'plannerpad';

export function Primary() {
  return <Button onClick={() => {}}>Create Room</Button>;
}

export function Secondary() {
  return <Button onClick={() => {}}>Join Room</Button>;
}

export function Disabled() {
  return <Button disabled>Unavailable</Button>;
}
