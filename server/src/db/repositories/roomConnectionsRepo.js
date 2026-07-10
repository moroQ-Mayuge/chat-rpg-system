import { db } from '../connection.js';

export function listConnectionsFrom(roomTemplateId) {
  return db
    .prepare(
      `SELECT rc.*, rt.name AS to_room_name
       FROM room_connections rc
       JOIN room_templates rt ON rt.id = rc.to_room_template_id
       WHERE rc.from_room_template_id = ?
       ORDER BY rc.id ASC`,
    )
    .all(roomTemplateId);
}

export function getConnection(id) {
  return db.prepare('SELECT * FROM room_connections WHERE id = ?').get(id);
}

export function createConnection({ from_room_template_id, to_room_template_id, label, movement_cost }) {
  const result = db
    .prepare(
      'INSERT INTO room_connections (from_room_template_id, to_room_template_id, label, movement_cost) VALUES (?, ?, ?, ?)',
    )
    .run(from_room_template_id, to_room_template_id, label ?? '', movement_cost ?? 1);
  return getConnection(result.lastInsertRowid);
}

export function updateConnection(id, { to_room_template_id, label, movement_cost }) {
  db.prepare('UPDATE room_connections SET to_room_template_id = ?, label = ?, movement_cost = ? WHERE id = ?').run(
    to_room_template_id,
    label ?? '',
    movement_cost ?? 1,
    id,
  );
  return getConnection(id);
}

export function deleteConnection(id) {
  db.prepare('DELETE FROM room_connections WHERE id = ?').run(id);
  return { deleted: true };
}
