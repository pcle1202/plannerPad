import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const ROOM_ADJECTIVES = ['Spontaneous','Cozy','Chaotic','Breezy','Rainy','Midnight','Lazy','Golden','Sneaky','Sleepy','Wild','Quiet','Secret','Cloudy','Sunny'];
const ROOM_NOUNS      = ['Road Trip','Brunch','Picnic','Cafe Run','Beach Day','Movie Night','Cabin Trip','Rooftop Party','Farmers Market','Bookstore Run','Thrift Haul','Hot Girl Walk','Karaoke Night','Ramen Run','Sleepover'];

function randomRoomName() {
  const adj  = ROOM_ADJECTIVES[Math.floor(Math.random() * ROOM_ADJECTIVES.length)];
  const noun = ROOM_NOUNS[Math.floor(Math.random() * ROOM_NOUNS.length)];
  return `${adj} ${noun}`;
}

function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'untitled-room';
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}

export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Untitled Room',
      slug TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      last_active_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS documents (
      id UUID PRIMARY KEY,
      room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL,
      ydoc_state BYTEA,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS documents_room_doc_type
      ON documents (room_id, doc_type);
  `);

  // No-op migrations for existing installs
  await pool.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Untitled Room'`);
  await pool.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS slug TEXT`);
  await pool.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP DEFAULT NOW()`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS rooms_slug_idx ON rooms (slug) WHERE slug IS NOT NULL`);
  // Back-fill slug for any rows that pre-date the slug column
  await pool.query(`UPDATE rooms SET slug = 'room-' || SUBSTRING(REPLACE(id::text, '-', ''), 1, 8) WHERE slug IS NULL`);
}

export async function roomExists(roomId) {
  const { rows } = await pool.query('SELECT id FROM rooms WHERE id = $1', [roomId]);
  return rows.length > 0;
}

export async function getRoomInfo(roomId) {
  const { rows } = await pool.query('SELECT id, name, slug FROM rooms WHERE id = $1', [roomId]);
  return rows[0] ?? null;
}

export async function getRoomBySlug(slug) {
  const { rows } = await pool.query('SELECT id, name, slug FROM rooms WHERE slug = $1', [slug]);
  return rows[0] ?? null;
}

export async function createRoom(roomId) {
  const suffix   = roomId.replace(/-/g, '').slice(0, 6);
  const name     = randomRoomName();
  const baseSlug = toSlug(name);
  const slug     = `${baseSlug}-${suffix}`;
  await pool.query(
    'INSERT INTO rooms (id, name, slug) VALUES ($1, $2, $3)',
    [roomId, name, slug]
  );
  return { slug, name };
}

export async function updateRoomSlug(roomId, name) {
  const baseSlug = toSlug(name);

  for (let attempt = 0; attempt <= 5; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomSuffix()}`;
    const { rows } = await pool.query('SELECT id FROM rooms WHERE slug = $1', [slug]);

    if (!rows.length || rows[0].id === roomId) {
      await pool.query('UPDATE rooms SET name = $1, slug = $2 WHERE id = $3', [name, slug, roomId]);
      return slug;
    }
  }

  // Last resort: UUID prefix guarantees uniqueness
  const slug = `${baseSlug}-${roomId.slice(0, 8)}`;
  await pool.query('UPDATE rooms SET name = $1, slug = $2 WHERE id = $3', [name, slug, roomId]);
  return slug;
}

export async function loadDocState(roomId, docType) {
  const { rows } = await pool.query(
    'SELECT ydoc_state FROM documents WHERE room_id = $1 AND doc_type = $2',
    [roomId, docType]
  );
  return rows[0]?.ydoc_state ?? null;
}

export async function saveDocState(roomId, docType, state) {
  await pool.query(
    `INSERT INTO documents (id, room_id, doc_type, ydoc_state, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, NOW())
     ON CONFLICT (room_id, doc_type)
     DO UPDATE SET ydoc_state = EXCLUDED.ydoc_state, updated_at = NOW()`,
    [roomId, docType, state]
  );
  await pool.query(
    'UPDATE rooms SET last_active_at = NOW() WHERE id = $1',
    [roomId]
  );
}

export async function deleteInactiveRooms() {
  const { rowCount } = await pool.query(
    `DELETE FROM rooms WHERE last_active_at < NOW() - INTERVAL '30 days'`
  );
  return rowCount ?? 0;
}

export async function deleteRoom(roomId) {
  // documents rows cascade-delete via FK ON DELETE CASCADE
  await pool.query('DELETE FROM rooms WHERE id = $1', [roomId]);
}
