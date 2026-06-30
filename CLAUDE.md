# PlannerPad — Project Reference

## PROJECT OVERVIEW

PlannerPad is a real-time collaborative planning app that combines a monthly calendar and a rich-text notes panel in a single shared workspace. Multiple users can join the same "room" via a link and see each other's edits, cursor positions, and calendar events live. There is no login — rooms are identified by a slug URL and anyone with the link can join.

---

## TECH STACK

**Frontend**
- React 19 (JSX, no TypeScript)
- React Router v7
- Yjs (CRDT for real-time state)
- y-websocket (client-side WebSocket provider)
- Vite (build tool)
- Plain CSS (no Tailwind or CSS-in-JS)

**Backend**
- Node.js (ESM)
- Express (REST API)
- ws + y-websocket (WebSocket server for Yjs)
- node-cron (scheduled cleanup)
- dotenv

**Persistence**
- PostgreSQL 16 (rooms table + Yjs document binary state)
- pg (node-postgres driver)

**Infrastructure**
- Docker + Docker Compose (three services: db, server, client)
- nginx (serves the React SPA, proxies `/api/` and `/yjs/` to the backend)

---

## ARCHITECTURE

```
Browser
  ├── React SPA (served by nginx on :80)
  │     ├── REST calls → /api/*  → nginx proxy → Express on :1337
  │     └── WebSocket  → /yjs/* → nginx proxy → y-websocket on :1337
  │
Server (:1337)
  ├── Express REST API  (room CRUD)
  └── y-websocket server (Yjs sync over WebSocket)
        └── setPersistence → PostgreSQL (load/save Yjs binary state per room)
  │
PostgreSQL (:5432)
  ├── rooms table (id UUID, slug, name, last_active, created_at)
  └── yjs_documents table (room_id, doc_name, data BYTEA)
```

**Yjs sync flow:**
1. Client connects via WebSocket to `/yjs/<roomId>`
2. Server loads the persisted Yjs binary from PostgreSQL (`bindState`)
3. Client receives the full document state and becomes `synced`
4. Every local edit is encoded as a Yjs update and broadcast to all connected clients
5. On disconnect, the server writes the latest Yjs state back to PostgreSQL (`writeState`)

**Awareness (presence/cursors):**
Yjs awareness is used for all ephemeral shared state: user name/color, calendar cursor position (x/y %), and editor caret offset (tab ID + character offset). This is never persisted — it lives only in the WebSocket connection.

---

## KEY FILES

```
/
├── docker-compose.yml          — Three-service stack: db, server, client
├── CLAUDE.md                   — This file

client/
├── vite.config.js              — Vite config; dev proxy for /api and /yjs → :1337
├── src/
│   ├── App.jsx                 — Router: / → HomeScreen, /room/:roomId → RoomScreen
│   ├── index.css               — All styles; design tokens as CSS vars
│   ├── screens/
│   │   ├── HomeScreen.jsx      — Landing: create room or join by slug/UUID/URL
│   │   └── RoomScreen.jsx      — Main app (2000+ lines, all components in one file):
│   │         ├── CalendarPanel         monthly grid, event CRUD, ICS export
│   │         ├── NotesPanel            tab bar, collapse/resize, editor mounting
│   │         ├── UnifiedEditor         contentEditable rich-text, Yjs sync, drag-to-reorder lists
│   │         ├── Toolbar               B/I/U/S, Aa style picker, list type picker
│   │         ├── CursorOverlay         renders remote user dots on the calendar
│   │         ├── RemoteEditorCursors   renders remote carets in the notes editor
│   │         ├── RoomNameEditor        inline rename with slug update
│   │         ├── LeaveModal            confirmation before leaving room
│   │         ├── DeleteModal           type-to-confirm room deletion
│   │         └── RoomContent           top-level room component, wires everything together
│   └── hooks/
│       └── useYjs.js           — WebSocket provider, awareness, displayName per tab

server/
├── src/
│   ├── index.js                — Express app + y-websocket + cron cleanup; entry point
│   ├── db.js                   — All PostgreSQL queries (rooms CRUD, Yjs persistence, cleanup)
│   └── yjsServer.js            — y-websocket setupWSConnection + PostgreSQL setPersistence
├── Dockerfile                  — Node 22 alpine, production deps only

client/
├── Dockerfile                  — Two-stage: Node 20 build → nginx:alpine serve
├── nginx.conf                  — SPA fallback + /api/ and /yjs/ proxy rules
```

---

## FEATURES

### Notes Panel
- Rich-text `contentEditable` editor synced via Yjs (`Y.Text` stores raw HTML per tab)
- Text styles: Title (`h1`), Heading (`h2`), Subheading (`h3`), Body (`p`), Monospace (`pre`)
- Inline formats: Bold, Italic, Underline, Strikethrough
- List types: Bullet, Numbered, Checklist (with check/uncheck toggle)
- All list types are draggable to reorder within the same list
- Checklist items can be dragged onto a calendar day to create an event
- Up to 5 named tabs per room; tabs are synced in real-time via `Y.Array`
- Panel width is adjustable by dragging the left edge (max 560px, auto-collapses below 120px)
- Word and character count in footer
- Export active tab as `.TXT`
- Undo/redo via Yjs `UndoManager` (Cmd+Z / Cmd+Shift+Z)
- Paste always inserts as plain text (HTML stripped)
- Image paste and drag-drop (max 500 KB, scaled to max 300px wide, stored as base64 JPEG)
- Dot-grid background pattern

### Calendar Panel
- Monthly grid with prev/next navigation
- Today's date highlighted with a pink filled badge
- Event CRUD: add, edit, delete; fields: title, all-day toggle, start date, end date, time, location
- Multi-day spanning events rendered as horizontal bars (up to 2 lanes)
- Drag an event pill to a different day to reschedule
- Export all events as `.ICS` (iCalendar format)
- Live cursor dots showing where other users' mice are (fades after 1.5s idle)

### Room Management
- Create room → random "Adjective Noun" name, generates URL slug
- Join by full URL, slug, or UUID (UUID redirects to slug URL)
- Rename room (inline editor in header; updates slug and navigates all clients)
- Copy room link to clipboard
- Leave room with confirmation modal
- Delete room with type-to-confirm modal; all connected clients are redirected home
- Rooms inactive for >30 days are auto-deleted at 03:00 UTC daily

### Presence / Collaboration
- Random animal display name per browser tab (e.g. `sleepyOtter42`), tab-scoped via `sessionStorage`
- User can rename themselves via the header menu
- User list badges in the header showing everyone currently connected
- Live cursor dots on the calendar panel per remote user (color-coded)
- Live text carets in the notes editor per remote user (color-coded, shows at their character offset)
- Remote edits don't disturb the local user's caret position (Yjs observer adjusts offset)

### Offline / Reconnection
- Offline banner shown when network is lost
- Main content dims during reconnect
- Yjs operates on local state while offline; changes sync automatically on reconnect
- "All changes saved" flash on successful reconnect

---

## KNOWN LIMITATIONS

- **No authentication** — anyone with the room URL can read and edit
- **No user accounts** — identity is a random name stored in `sessionStorage`, lost if the browser tab is closed
- **Single Yjs doc per room** — all tabs and calendar events share one `Y.Doc` (`roomId/main`)
- **Image storage** — images are base64-encoded inline in the Yjs document (not in object storage); large images can bloat the doc
- **Max 2 multi-day event lanes** in the calendar grid
- **No mobile layout** — designed for desktop only
- **No end-to-end encryption** — room content is stored plaintext in PostgreSQL

---

## LOCAL DEV SETUP

Requires: Docker, Node.js 20+

**Option A — Full stack with Docker Compose**
```bash
cd /path/to/project
docker compose up --build
# App: http://localhost
# API: http://localhost/api
```

**Option B — Dev mode (hot reload)**

Terminal 1 — database only:
```bash
docker compose up db
```

Terminal 2 — backend:
```bash
cd server
DATABASE_URL=postgresql://plannerpad:plannerpad@localhost:5432/plannerpad PORT=1337 npm run dev
```

Terminal 3 — frontend (Vite proxies /api and /yjs to :1337):
```bash
cd client
npm install
npm run dev
# App: http://localhost:5173
```

---

## DEPLOYMENT

Deployed on **AWS EC2** with **Docker Compose**. nginx serves the React SPA and proxies API/WebSocket traffic to the Node backend. PostgreSQL data is persisted in a named Docker volume (`pg_data`).

**To redeploy after code changes:**
```bash
# SSH into EC2
git pull
docker compose down
docker compose up --build -d
```

**To view logs:**
```bash
docker compose logs -f server
docker compose logs -f client
```

---

## ENVIRONMENT VARIABLES

### Server (`server/src/index.js` via dotenv)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string, e.g. `postgresql://user:pass@host:5432/dbname` |
| `PORT` | No | Port for Express + y-websocket server. Defaults to `1337` |

In Docker Compose these are set directly in `docker-compose.yml`. For local dev, export them in the shell or create a `server/.env` file.

### Client

No runtime environment variables — the Vite build is fully static. API and WebSocket URLs are always relative (`/api/`, `/yjs/`) and resolved by nginx or Vite's dev proxy.
