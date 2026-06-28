import React from 'react';

/**
 * Primary action button. Uses the pink pastel `.btn` style —
 * solid `--primary` fill with a hard 2px pixel border and offset shadow.
 */
export function Button({ children, onClick, disabled, type = 'button' }) {
  return (
    <button className="btn" type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
