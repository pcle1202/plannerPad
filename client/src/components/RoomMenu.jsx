import React, { useState, useRef, useEffect } from 'react';

/**
 * The ··· room-settings dropdown in the pathbar.
 * Contains: Copy Link, Export .ICS, Export .TXT, Rename Room,
 * [divider], Leave Room, Delete Room (danger).
 *
 * All actions are callbacks; the menu manages its own open/close state
 * and closes on outside click.
 */
export function RoomMenu({
  onCopyLink,
  onExportIcs,
  onExportTxt,
  onRename,
  onLeave,
  onDelete,
}) {
  const [open,   setOpen]   = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  function handleCopyLink() {
    onCopyLink?.();
    setCopied(true);
    setTimeout(() => { setCopied(false); setOpen(false); }, 1500);
  }

  return (
    <div className="room-menu" ref={ref}>
      <button
        className="room-menu__trigger"
        onClick={() => setOpen(o => !o)}
        title="Room options"
      >···</button>
      {open && (
        <div className="room-menu__dropdown">
          <button className="room-menu__item" onClick={handleCopyLink}>
            {copied ? '✓ Copied!' : '⎘ Copy Link'}
          </button>
          <button className="room-menu__item" onClick={() => { setOpen(false); onExportIcs?.(); }}>
            ↓ Export .ICS
          </button>
          <button className="room-menu__item" onClick={() => { setOpen(false); onExportTxt?.(); }}>
            ↓ Export .TXT
          </button>
          <button className="room-menu__item" onClick={() => { setOpen(false); onRename?.(); }}>
            ✎ Rename Room
          </button>
          <div className="room-menu__divider" />
          <button className="room-menu__item" onClick={() => { setOpen(false); onLeave?.(); }}>
            ← Leave Room
          </button>
          <button
            className="room-menu__item room-menu__item--danger"
            onClick={() => { setOpen(false); onDelete?.(); }}
          >
            ✕ Delete Room
          </button>
        </div>
      )}
    </div>
  );
}
