import { db } from '../connection.js';

// Same common(world_id IS NULL) + World-specific tier as items/item_categories.
export function listStatusesForWorld(worldId) {
  return db
    .prepare('SELECT * FROM character_statuses WHERE world_id IS NULL OR world_id = ? ORDER BY world_id IS NULL DESC, name ASC')
    .all(worldId);
}

export function listAllStatuses() {
  return db.prepare('SELECT * FROM character_statuses ORDER BY world_id IS NULL DESC, name ASC').all();
}

export function getStatus(id) {
  return db.prepare('SELECT * FROM character_statuses WHERE id = ?').get(id);
}

export function createStatus({ world_id, name, persistence_scope, removes_from_session }) {
  const result = db
    .prepare('INSERT INTO character_statuses (world_id, name, persistence_scope, removes_from_session) VALUES (?, ?, ?, ?)')
    .run(world_id ?? null, name, persistence_scope, removes_from_session ? 1 : 0);
  return getStatus(result.lastInsertRowid);
}

export function updateStatus(id, { world_id, name, persistence_scope, removes_from_session }) {
  db.prepare('UPDATE character_statuses SET world_id = ?, name = ?, persistence_scope = ?, removes_from_session = ? WHERE id = ?').run(
    world_id ?? null,
    name,
    persistence_scope,
    removes_from_session ? 1 : 0,
    id,
  );
  return getStatus(id);
}

export function deleteStatus(id) {
  db.prepare('DELETE FROM character_statuses WHERE id = ?').run(id);
  return { deleted: true };
}
