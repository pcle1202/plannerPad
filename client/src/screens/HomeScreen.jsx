import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseRoomInput(raw) {
  const trimmed = raw.trim();
  // Accept full URL or path containing /room/<identifier>
  const m = trimmed.match(/\/room\/([^/?#\s]+)/);
  if (m) return m[1];
  // Plain slug or UUID
  return trimmed || null;
}

export default function HomeScreen() {
  const navigate  = useNavigate();
  const location  = useLocation();

  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [joinInput,   setJoinInput]   = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError,   setJoinError]   = useState(null);
  const [toast,       setToast]       = useState(location.state?.deletedRoom ? 'Room was deleted' : null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('http://localhost:1337/api/rooms', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { slug } = await res.json();
      navigate(`/room/${slug}`);
    } catch (e) {
      setError(`Could not reach the server. Is it running? (${e.message})`);
      setLoading(false);
    }
  }

  async function handleJoin(e) {
    e?.preventDefault();
    const identifier = parseRoomInput(joinInput);
    if (!identifier) { setJoinError('Enter a room URL, slug, or ID'); return; }

    setJoinLoading(true);
    setJoinError(null);
    try {
      let slug;
      if (UUID_RE.test(identifier)) {
        const res  = await fetch(`http://localhost:1337/api/rooms/${identifier}`);
        const data = await res.json();
        if (!data.exists) { setJoinError('Room not found'); setJoinLoading(false); return; }
        slug = data.slug;
      } else {
        const res = await fetch(`http://localhost:1337/api/rooms/by-slug/${encodeURIComponent(identifier)}`);
        if (!res.ok) { setJoinError('Room not found'); setJoinLoading(false); return; }
        const data = await res.json();
        slug = data.slug;
      }
      navigate(`/room/${slug}`);
    } catch {
      setJoinError('Could not reach the server. Is it running?');
      setJoinLoading(false);
    }
  }

  return (
    <div className="home">
      {toast && <div className="toast">{toast}</div>}
      <div className="boot-card">
        <div className="boot-card__titlebar">
          <div className="app-logo">✦ PlannerPad</div>
          <div className="app-tagline">Your real-time collaborative planner</div>
        </div>
        <div className="boot-card__body">
          <div className="boot-card__line">
            <span className="feature-dot" />
            Plan together in real-time with live sync
          </div>
          <div className="boot-card__line">
            <span className="feature-dot" />
            See everyone's cursor and presence
          </div>
          <div className="boot-card__line">
            <span className="feature-dot" />
            Rooms persist — pick up where you left off
          </div>
          <hr className="boot-card__divider" />
          {error && <div className="boot-card__error">{error}</div>}
          <button className="btn" onClick={handleCreate} disabled={loading}>
            {loading ? 'Creating room…' : '+ Create New Room'}
          </button>
          <hr className="boot-card__divider" />
          <form className="boot-card__join" onSubmit={handleJoin}>
            <div className="boot-card__join-label">Or join an existing room</div>
            <div className="boot-card__join-row">
              <input
                className="boot-card__join-input"
                type="text"
                placeholder="Paste URL or room slug…"
                value={joinInput}
                onChange={e => { setJoinInput(e.target.value); setJoinError(null); }}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                className="btn boot-card__join-btn"
                type="submit"
                disabled={joinLoading || !joinInput.trim()}
              >
                {joinLoading ? '…' : 'JOIN'}
              </button>
            </div>
            {joinError && <div className="boot-card__error">{joinError}</div>}
          </form>
        </div>
      </div>
    </div>
  );
}
