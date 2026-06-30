# plannerpad

This is a collaborative planning app I built because I wanted one place with both a calendar and notes side by side, synced live for everyone in the room.

Live: https://your-live-url.com

---

![Demo](demo.gif)

---

## Features

- shared calendar with events, multi-day spans, locations, and drag to reschedule
- notes panel with rich text, text styles, and bullet/numbered/checklist lists
- drag a checklist item onto a calendar day to create an event
- up to 5 notes tabs per room
- live cursors and text carets so you can see what others are doing
- everything syncs instantly with Yjs CRDTs with no conflicts, even when offline
- export events as .ICS or notes as .TXT
- rooms and users get a random name on creation and may rename at anytime
- no account needed

## Stack

React, Vite, Yjs (CRDT) + y-websocket, Node.js, Express, PostgreSQL, Docker Compose, nginx. Deployed on AWS EC2.

## Getting started

```bash
git clone https://github.com/pcle1202/plannerpad
cd plannerpad
npm start
```

`npm start` installs dependencies, sets up env files, and starts everything in Docker. It'll print the URL when ready.

```bash
npm stop
```

To wipe all data: `docker compose down -v`

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://plannerpad:plannerpad@db:5432/plannerpad` |
| `PORT` | Server port | `1337` |

## How it works

Every client holds a local Yjs document with the room's full state. Changes get encoded as small binary updates and broadcast over WebSocket, so everyone converges to the same state no matter what order updates arrive in. The server saves this state to PostgreSQL so rooms survive restarts.

## Known limitations

- no authentication, anyone with the link can edit
- no persistent identity across devices
- images are stored inline as base64, not in object storage
- desktop only

## License

MIT
