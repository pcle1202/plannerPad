import React from 'react';
import { FormatToolbar } from 'plannerpad';

export function Default() {
  return <FormatToolbar />;
}

export function BoldActive() {
  return <FormatToolbar activeFormats={{ bold: true }} activeStyle="p" />;
}

export function MultiActive() {
  return (
    <FormatToolbar
      activeFormats={{ bold: true, italic: true, underline: true }}
      activeStyle="h2"
      canUndo={true}
      canRedo={false}
    />
  );
}
