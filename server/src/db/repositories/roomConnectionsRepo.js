import { db } from '../connection.js';

// Connections (経路) are World-scoped: the same room pair can be wired
// differently, or not at all, in different Worlds.
export function listConnectionsFrom(roomTemplateId, worldId) {
  return db
    .prepare(
      `SELECT rc.*, rt.name AS to_room_name
       FROM room_connections rc
       JOIN room_templates rt ON rt.id = rc.to_room_template_id
       WHERE rc.from_room_template_id = ? AND rc.world_id = ?
       ORDER BY rc.id ASC`,
    )
    .all(roomTemplateId, worldId);
}

export function getConnection(id) {
  return db.prepare('SELECT * FROM room_connections WHERE id = ?').get(id);
}

export function createConnection({ world_id, from_room_template_id, to_room_template_id, label, movement_cost, ends_session }) {
  const result = db
    .prepare(
      'INSERT INTO room_connections (world_id, from_room_template_id, to_room_template_id, label, movement_cost, ends_session) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(world_id, from_room_template_id, to_room_template_id, label ?? '', movement_cost ?? 1, ends_session ? 1 : 0);
  return getConnection(result.lastInsertRowid);
}

export function updateConnection(id, { to_room_template_id, label, movement_cost, ends_session }) {
  db.prepare('UPDATE room_connections SET to_room_template_id = ?, label = ?, movement_cost = ?, ends_session = ? WHERE id = ?').run(
    to_room_template_id,
    label ?? '',
    movement_cost ?? 1,
    ends_session ? 1 : 0,
    id,
  );
  return getConnection(id);
}

export function deleteConnection(id) {
  db.prepare('DELETE FROM room_connections WHERE id = ?').run(id);
  return { deleted: true };
}
