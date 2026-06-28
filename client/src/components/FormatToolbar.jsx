import React, { useState, useRef, useEffect } from 'react';

/**
 * Single-row rich-text formatting toolbar used inside the Notes panel.
 *
 * Always visible: B · I · U · S buttons (bold, italic, underline, strikethrough).
 * "Aa" button opens a popover containing:
 *   – Text Style picker (Title / Heading / Body / Small)
 *   – Lists section (collapsible: Bullet / Numbered / Checkbox)
 *   – Undo / Redo row
 *
 * All formatting actions are callbacks; the component holds only UI state.
 */
export function FormatToolbar({
  activeFormats = {},
  activeStyle   = 'p',
  onFormat,
  onStyle,
  onList,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}) {
  const [aaOpen,   setAaOpen]   = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const aaRef = useRef(null);

  useEffect(() => {
    if (!aaOpen) return;
    const close = e => { if (!aaRef.current?.contains(e.target)) setAaOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [aaOpen]);

  useEffect(() => { if (!aaOpen) setListOpen(false); }, [aaOpen]);

  const STYLES = [
    { tag: 'h1', label: 'Title' },
    { tag: 'h2', label: 'Heading' },
    { tag: 'p',  label: 'Body' },
    { tag: 'h6', label: 'Small' },
  ];

  return (
    <div className="format-toolbar">
      <div className="format-toolbar__row">
        <button
          className={`format-btn${activeFormats.bold    ? ' format-btn--active' : ''}`}
          onMouseDown={e => { e.preventDefault(); onFormat?.('bold'); }}
          title="Bold (⌘B)"
        >B</button>
        <button
          className={`format-btn format-btn--i${activeFormats.italic  ? ' format-btn--active' : ''}`}
          onMouseDown={e => { e.preventDefault(); onFormat?.('italic'); }}
          title="Italic (⌘I)"
        >I</button>
        <button
          className={`format-btn format-btn--u${activeFormats.underline ? ' format-btn--active' : ''}`}
          onMouseDown={e => { e.preventDefault(); onFormat?.('underline'); }}
          title="Underline (⌘U)"
        >U</button>
        <button
          className={`format-btn format-btn--s${activeFormats.strike  ? ' format-btn--active' : ''}`}
          onMouseDown={e => { e.preventDefault(); onFormat?.('strike'); }}
          title="Strikethrough"
        >S</button>

        <div className="aa-menu" ref={aaRef}>
          <button
            className={`format-btn aa-btn${aaOpen ? ' format-btn--active' : ''}`}
            onMouseDown={e => e.preventDefault()}
            onClick={() => setAaOpen(o => !o)}
            title="Text styles & more"
          >Aa</button>
          {aaOpen && (
            <div className="aa-popover">
              <div className="aa-section-label">Text Style</div>
              {STYLES.map(({ tag, label }) => (
                <button
                  key={tag}
                  className={`aa-item${activeStyle === tag ? ' aa-item--active' : ''}`}
                  onMouseDown={e => { e.preventDefault(); onStyle?.(tag); setAaOpen(false); }}
                >{label}</button>
              ))}
              <div className="aa-divider" />
              <button
                className="aa-section-toggle"
                onMouseDown={e => e.preventDefault()}
                onClick={() => setListOpen(o => !o)}
              >Lists <span>{listOpen ? '▴' : '▾'}</span></button>
              {listOpen && (
                <>
                  <button className="aa-item" onMouseDown={e => { e.preventDefault(); onList?.('bullet');   setAaOpen(false); }}>• Bullet List</button>
                  <button className="aa-item" onMouseDown={e => { e.preventDefault(); onList?.('numbered'); setAaOpen(false); }}># Numbered List</button>
                  <button className="aa-item" onMouseDown={e => { e.preventDefault(); onList?.('checkbox'); setAaOpen(false); }}>☑ Checkbox List</button>
                </>
              )}
              <div className="aa-divider" />
              <div className="aa-row">
                <button className="aa-item aa-item--half" onMouseDown={e => { e.preventDefault(); onUndo?.(); }} disabled={!canUndo}>↩ Undo</button>
                <button className="aa-item aa-item--half" onMouseDown={e => { e.preventDefault(); onRedo?.(); }} disabled={!canRedo}>↪ Redo</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
