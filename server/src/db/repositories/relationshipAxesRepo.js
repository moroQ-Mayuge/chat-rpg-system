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
  llm_auto_update_enabled = true,
}) {
  const result = db
    .prepare(
      'INSERT INTO relationship_axes (name, min_value, max_value, default_value, scope, regen_per_time_slot, llm_auto_update_enabled) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(name, min_value, max_value, default_value, scope, regen_per_time_slot, llm_auto_update_enabled ? 1 : 0);
  return getRelationshipAxis(result.lastInsertRowid);
}

export function updateRelationshipAxis(
  id,
  { name, min_value, max_value, default_value, scope, regen_per_time_slot, llm_auto_update_enabled },
) {
  db.prepare(
    `UPDATE relationship_axes
     SET name = ?, min_value = ?, max_value = ?, default_value = ?, scope = ?, regen_per_time_slot = ?, llm_auto_update_enabled = ?
     WHERE id = ?`,
  ).run(
    name,
    min_value,
    max_value,
    default_value,
    scope ?? 'relationship',
    regen_per_time_slot ?? null,
    llm_auto_update_enabled === false ? 0 : 1,
    id,
  );
  return getRelationshipAxis(id);
}

// Self-stat axes with a non-NULL regen_per_time_slot passively drift every
// time slot (advanceTime), independent of any event-authored change.
export function listRegeneratingSelfStatAxes() {
  return db
    .prepare("SELECT * FROM relationship_axes WHERE scope = 'self_stat' AND regen_per_time_slot IS NOT NULL")
    .all();
}

// All self-stat axes regardless of regen — used to build a status snapshot
// (statusSnapshotRepo.js) covering every self-stat, not just the drifting ones.
export function listSelfStatAxes() {
  return db.prepare("SELECT * FROM relationship_axes WHERE scope = 'self_stat'").all();
}

// Axes eligible for the LLM auto-update mechanism (SPEC.md): scope is
// 'self_stat' or 'relationship', filtered to llm_auto_update_enabled=1 so an
// admin can exclude a specific axis (e.g. one meant to be changed only by
// explicit event actions) from the LLM's free-form adjustments.
export function listLlmAutoUpdateEnabledAxes(scope) {
  return db.prepare('SELECT * FROM relationship_axes WHERE scope = ? AND llm_auto_update_enabled = 1').all(scope);
}

export function deleteRelationshipAxis(id) {
  db.prepare('DELETE FROM relationship_axes WHERE id = ?').run(id);
  return { deleted: true };
}
