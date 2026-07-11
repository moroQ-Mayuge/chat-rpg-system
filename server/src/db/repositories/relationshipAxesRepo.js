import { db } from '../connection.js';

export function listRelationshipAxes() {
  return db.prepare('SELECT * FROM relationship_axes ORDER BY id ASC').all();
}

export function getRelationshipAxis(id) {
  return db.prepare('SELECT * FROM relationship_axes WHERE id = ?').get(id);
}

export function createRelationshipAxis({
  name,
  min_value = 0,
  max_value = 100,
  default_value = 0,
  scope = 'relationship',
  regen_per_time_slot = null,
}) {
  const result = db
    .prepare(
      'INSERT INTO relationship_axes (name, min_value, max_value, default_value, scope, regen_per_time_slot) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(name, min_value, max_value, default_value, scope, regen_per_time_slot);
  return getRelationshipAxis(result.lastInsertRowid);
}

export function updateRelationshipAxis(id, { name, min_value, max_value, default_value, scope, regen_per_time_slot }) {
  db.prepare(
    `UPDATE relationship_axes
     SET name = ?, min_value = ?, max_value = ?, default_value = ?, scope = ?, regen_per_time_slot = ?
     WHERE id = ?`,
  ).run(name, min_value, max_value, default_value, scope ?? 'relationship', regen_per_time_slot ?? null, id);
  return getRelationshipAxis(id);
}

// Self-stat axes with a non-NULL regen_per_time_slot passively drift every
// time slot (advanceTime), independent of any event-authored change.
export function listRegeneratingSelfStatAxes() {
  return db
    .prepare("SELECT * FROM relationship_axes WHERE scope = 'self_stat' AND regen_per_time_slot IS NOT NULL")
    .all();
}

export function deleteRelationshipAxis(id) {
  db.prepare('DELETE FROM relationship_axes WHERE id = ?').run(id);
  return { deleted: true };
}
