import React from 'react';
import { Toast } from 'plannerpad';

/* Override position:fixed so the toast renders inside the card instead of at viewport bottom */
const toastFix = `.toast { position: relative !important; bottom: auto !important; left: auto !important; transform: none !important; }`;

export function Copied() {
  return (
    <>
      <style>{toastFix}</style>
      <Toast message="Link copied to clipboard!" />
    </>
  );
}

export function Saved() {
  return (
    <>
      <style>{toastFix}</style>
      <Toast message="Exported to notes.txt" />
    </>
  );
}
