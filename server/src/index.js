import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';
import { initSchema, createRoom, getRoomInfo, getRoomBySlug, updateRoomSlug, deleteRoom, deleteInactiveRooms } from './db.js';
import { setupYjsWebSocket } from './yjsServer.js';

const app = express();
app.use(cors());
app.use(express.json());

// POST /api/rooms — create a new room
app.post('/api/rooms', async (req, res) => {
  try {
    const roomId = uuidv4();
    const { slug, name } = await createRoom(roomId);
    res.status(201).json({ roomId, slug, name });
  } catch (err) {
    console.error('create room error', err);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// GET /api/rooms/by-slug/:slug — look up a room by its slug
app.get('/api/rooms/by-slug/:slug', async (req, res) => {
  try {
    const room = await getRoomBySlug(req.params.slug);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json({ roomId: room.id, slug: room.slug, name: room.name });
  } catch (err) {
    console.error('by-slug error', err);
    res.status(500).json({ error: 'Failed to find room' });
  }
});

// GET /api/rooms/:roomId — check room by UUID (redirects to slug on client)
app.get('/api/rooms/:roomId', async (req, res) => {
  try {
    const room = await getRoomInfo(req.params.roomId);
    if (!room) return res.status(404).json({ exists: false });
    res.json({ exists: true, roomId: room.id, slug: room.slug, name: room.name });
  } catch (err) {
    console.error('get room error', err);
    res.status(500).json({ error: 'Failed to check room' });
  }
});

// PUT /api/rooms/:roomId/name — update room name and regenerate slug
app.put('/api/rooms/:roomId/name', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const slug = await updateRoomSlug(req.params.roomId, name.trim());
    res.json({ slug });
  } catch (err) {
    console.error('update name error', err);
    res.status(500).json({ error: 'Failed to update room name' });
  }
});

// DELETE /api/rooms/:roomId — permanently delete a room and all its documents
app.delete('/api/rooms/:roomId', async (req, res) => {
  try {
    const room = await getRoomInfo(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    await deleteRoom(req.params.roomId);
    res.json({ deleted: true });
  } catch (err) {
    console.error('delete room error', err);
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

const server = createServer(app);
setupYjsWebSocket(server);

const PORT = process.env.PORT || 1337;

async function start() {
  await initSchema();
  server.listen(PORT, () => {
    console.log(`PlannerPad server running on port ${PORT}`);
  });

  // Daily cleanup at 03:00 — delete rooms inactive for >30 days
  cron.schedule('0 3 * * *', async () => {
    try {
      const count = await deleteInactiveRooms();
      console.log(`[cleanup] Deleted ${count} inactive room(s)`);
    } catch (err) {
      console.error('[cleanup] Failed:', err);
    }
  });
}

start().catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});
