import React, { useState } from 'react';

/**
 * Inline editable display name for the current user.
 * Shows the name with a pencil icon (✎); click to enter edit mode.
 * Calls `onSave(newName)` on Enter or blur.
 */
export function NameEditor({ displayName = 'sillyWolf42', onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');

  function commit() {
    onSave?.(draft);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        className="name-editor__input"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      className="name-editor__btn"
      onClick={() => { setDraft(displayName); setEditing(true); }}
    >
      {displayName}<span className="name-editor__pencil">✎</span>
    </button>
  );
}
