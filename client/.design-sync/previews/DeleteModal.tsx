import React from 'react';

const ROOM = 'Rainy Cafe Run';

/* Renders modal box inline — no position:fixed overlay, no autoFocus */
export function EmptyInput() {
  return (
    <div className="modal">
      <div className="modal__titlebar">⚠ DELETE ROOM</div>
      <div className="modal__body">
        <p className="modal__warning">
          This will permanently delete <strong>{ROOM}</strong> and all its data for everyone.
        </p>
        <p className="modal__prompt">
          Type <span className="modal__code">delete {ROOM}</span> to confirm:
        </p>
        <input className="modal__input" defaultValue="" spellCheck={false} />
        <div className="modal__actions">
          <button className="modal__btn">Cancel</button>
          <button className="modal__btn modal__btn--danger" disabled>Delete Room</button>
        </div>
      </div>
    </div>
  );
}

export function ReadyToDelete() {
  return (
    <div className="modal">
      <div className="modal__titlebar">⚠ DELETE ROOM</div>
      <div className="modal__body">
        <p className="modal__warning">
          This will permanently delete <strong>{ROOM}</strong> and all its data for everyone.
        </p>
        <p className="modal__prompt">
          Type <span className="modal__code">delete {ROOM}</span> to confirm:
        </p>
        <input className="modal__input" defaultValue={`delete ${ROOM}`} spellCheck={false} readOnly />
        <div className="modal__actions">
          <button className="modal__btn">Cancel</button>
          <button className="modal__btn modal__btn--danger">Delete Room</button>
        </div>
      </div>
    </div>
  );
}
