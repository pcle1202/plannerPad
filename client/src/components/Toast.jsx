import React from 'react';

/**
 * Fixed-position notification that floats above the UI.
 * Positioned bottom-center, dark background, Nunito 700 12px.
 */
export function Toast({ message }) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}
