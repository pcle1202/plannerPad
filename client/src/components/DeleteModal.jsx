import React, { useState } from 'react';

/**
 * Confirmation dialog requiring the user to type "delete [roomName]"
 * before the destructive action is enabled.
 * `onConfirm` and `onCancel` are callbacks; clicking the overlay also cancels.
 */
export function DeleteModal({ roomName = 'Rainy Cafe Run', onConfirm, onCancel }) {
  const [typed, setTyped] = useState('');
  const expected = `delete ${roomName}`;
  const matches  = typed.trim().toLowerCase() === expected.toLowerCase();

  return (
    <div
      className="modal-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel?.(); }}
    >
      <div className="modal">
        <div className="modal__titlebar">⚠ DELETE ROOM</div>
        <div className="modal__body">
          <p className="modal__warning">
            This will permanently delete <strong>{roomName}</strong> and all its
            data for everyone.
          </p>
          <p className="modal__prompt">
            Type <span className="modal__code">delete {roomName}</span> to confirm:
          </p>
          <input
            className="modal__input"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && matches) onConfirm?.();
              if (e.key === 'Escape') onCancel?.();
            }}
            autoFocus
            spellCheck={false}
          />
          <div className="modal__actions">
            <button className="modal__btn" onClick={() => onCancel?.()}>Cancel</button>
            <button
              className="modal__btn modal__btn--danger"
              onClick={() => onConfirm?.()}
              disabled={!matches}
            >
              Delete Room
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
