import { db } from '../connection.js';

// character_statuses is shared master data (see
// 0040_character_status_world_membership.sql): a status with no rows in
// world_character_statuses is common (usable everywhere); one with rows is
// scoped to exactly those Worlds. Same shape as world_room_templates.
export function listStatusesForWorld(worldId) {
  return db
    .prepare(
      `SELECT cs.* FROM character_statuses cs
       WHERE NOT EXISTS (SELECT 1 FROM world_character_statuses wcs WHERE wcs.status_id = cs.id)
          OR EXISTS (SELECT 1 FROM world_character_statuses wcs WHERE wcs.status_id = cs.id AND wcs.world_id = ?)
       ORDER BY name ASC`,
    )
    .all(worldId);
}

export function listAllStatuses() {
  return db.prepare('SELECT * FROM character_statuses ORDER BY name ASC').all();
}

export function getStatus(id) {
  return db.prepare('SELECT * FROM character_statuses WHERE id = ?').get(id);
}

export function createStatus({
  name,
  persistence_scope,
  removes_from_session,
  exclusive_group,
  default_address_on_grant,
  suppresses_outfit_fields,
}) {
  const result = db
    .prepare(
      'INSERT INTO character_statuses (name, persistence_scope, removes_from_session, exclusive_group, default_address_on_grant, suppresses_outfit_fields) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(
      name,
      persistence_scope,
      removes_from_session ? 1 : 0,
      exclusive_group || null,
      default_address_on_grant || null,
      suppresses_outfit_fields ?? '',
    );
  return getStatus(result.lastInsertRowid);
}

export function updateStatus(
  id,
  { name, persistence_scope, removes_from_session, exclusive_group, default_address_on_grant, suppresses_outfit_fields },
) {
  db.prepare(
    'UPDATE character_statuses SET name = ?, persistence_scope = ?, removes_from_session = ?, exclusive_group = ?, default_address_on_grant = ?, suppresses_outfit_fields = ? WHERE id = ?',
  ).run(
    name,
    persistence_scope,
    removes_from_session ? 1 : 0,
    exclusive_group || null,
    default_address_on_grant || null,
    suppresses_outfit_fields ?? '',
    id,
  );
  return getStatus(id);
}

export function deleteStatus(id) {
  db.prepare('DELETE FROM character_statuses WHERE id = ?').run(id);
  return { deleted: true };
}

// World membership -- same shape as worldRoomTemplatesRepo.js.
export function listWorldsForStatus(statusId) {
  return db
    .prepare(
      `SELECT w.* FROM worlds w
       JOIN world_character_statuses wcs ON wcs.world_id = w.id
       WHERE wcs.status_id = ?
       ORDER BY w.name ASC`,
    )
    .all(statusId);
}

export function attachStatusToWorld(worldId, statusId) {
  db.prepare('INSERT OR IGNORE INTO world_character_statuses (world_id, status_id) VALUES (?, ?)').run(worldId, statusId);
  return { attached: true };
}

export function detachStatusFromWorld(worldId, statusId) {
  db.prepare('DELETE FROM world_character_statuses WHERE world_id = ? AND status_id = ?').run(worldId, statusId);
  return { detached: true };
}
