import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const PALETTE    = ['#7C3AED', '#1D4ED8', '#059669', '#B45309', '#BE185D', '#C2410C', '#0E7490'];
const ADJECTIVES = ['Sleepy', 'Fuzzy', 'Calm', 'Brave', 'Happy', 'Gentle', 'Silly', 'Wise', 'Quick', 'Bold', 'Shy', 'Lazy'];
const ANIMALS    = ['Panda', 'Rabbit', 'Otter', 'Fox', 'Deer', 'Bear', 'Wolf', 'Owl', 'Cat', 'Dog', 'Hawk', 'Seal'];

function initDisplayName() {
  // sessionStorage is tab-scoped, so each tab (= each "user" in testing) gets its own name.
  // Page refreshes within the same tab restore the existing name via sessionStorage.
  const tab = sessionStorage.getItem('plannerpad_tabname');
  if (tab) return tab;
  const adj    = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const num    = Math.floor(Math.random() * 99) + 1;
  const name   = `${adj[0].toLowerCase()}${adj.slice(1)}${animal}${num}`;
  sessionStorage.setItem('plannerpad_tabname', name);
  return name;
}

export function useYjs(roomId) {
  const [displayName, setDisplayNameState] = useState(initDisplayName);
  const myColor     = useRef(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
  const providerRef = useRef(null);

  const [status, setStatus]             = useState('connecting');
  const [users, setUsers]               = useState([]);
  const [cursors, setCursors]           = useState([]);
  const [editorCursors, setEditorCursors] = useState([]);
  const [doc, setDoc]                   = useState(null);
  const [synced, setSynced]             = useState(false);

  useEffect(() => {
    if (!roomId) return;

    const ydoc     = new Y.Doc();
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const provider = new WebsocketProvider(`${wsProto}//${window.location.host}/yjs`, roomId, ydoc);
    providerRef.current = provider;

    setDoc(ydoc);
    provider.once('sync', isSynced => { if (isSynced) setSynced(true); });

    provider.awareness.setLocalStateField('user', {
      name: displayName, color: myColor.current,
    });

    const myId = provider.awareness.clientID;

    const onStatus = ({ status: s }) => setStatus(s);
    const onAwarenessChange = () => {
      const entries = [...provider.awareness.getStates().entries()];
      setUsers(entries.filter(([, s]) => s.user).map(([, s]) => s.user));
      const others = entries.filter(([id, s]) => id !== myId && s.user);
      setCursors(
        others
          .filter(([, s]) => s.cursor && s.cursor.x != null)
          .map(([id, s]) => ({
            clientId: id,
            name: s.user.name,
            color: s.user.color,
            x: s.cursor.x,
            y: s.cursor.y,
            updatedAt: s.cursor.t || Date.now(),
          }))
      );
      setEditorCursors(
        others
          .filter(([, s]) => s.editorCursor != null)
          .map(([id, s]) => ({
            clientId: id,
            name: s.user.name,
            color: s.user.color,
            tabId: s.editorCursor.tabId,
            offset: s.editorCursor.offset,
          }))
      );
    };

    provider.on('status', onStatus);
    provider.awareness.on('change', onAwarenessChange);
    onAwarenessChange();

    return () => {
      providerRef.current = null;
      provider.off('status', onStatus);
      provider.awareness.off('change', onAwarenessChange);
      provider.destroy();
      ydoc.destroy();
      setDoc(null);
      setSynced(false);
      setCursors([]);
      setEditorCursors([]);
    };
  }, [roomId]); // displayName intentionally excluded — handled by separate effect

  // Push name changes to awareness without reconnecting
  useEffect(() => {
    providerRef.current?.awareness.setLocalStateField('user', {
      name: displayName, color: myColor.current,
    });
  }, [displayName]);

  const setCursor = useCallback((x, y) => {
    providerRef.current?.awareness.setLocalStateField('cursor', { x, y, t: Date.now() });
  }, []);

  const setEditorCursor = useCallback((tabId, offset) => {
    providerRef.current?.awareness.setLocalStateField('editorCursor', { tabId, offset });
  }, []);

  function setDisplayName(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem('plannerpad_username', trimmed);
    localStorage.setItem('plannerpad_username_manual', 'true');
    sessionStorage.setItem('plannerpad_tabname', trimmed);
    setDisplayNameState(trimmed);
  }

  return {
    status, users, cursors, editorCursors, doc, synced,
    displayName, setDisplayName,
    myColor: myColor.current,
    setCursor, setEditorCursor,
  };
}
