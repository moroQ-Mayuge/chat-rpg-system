import { db } from '../connection.js';

export function getAxis(axisId) {
  return db.prepare('SELECT * FROM relationship_axes WHERE id = ?').get(axisId);
}

export function getValue(playthroughId, characterId, axisId) {
  const row = db
    .prepare(
      'SELECT current_value FROM relationship_states WHERE playthrough_id = ? AND character_id = ? AND relationship_axis_id = ?',
    )
    .get(playthroughId, characterId, axisId);
  if (row) return row.current_value;
  return getAxis(axisId)?.default_value ?? 0;
}

function clamp(value, axis) {
  return Math.max(axis.min_value, Math.min(axis.max_value, value));
}

// operation: "add" | "subtract" | "set". Result is clamped to the axis's min/max.
export function adjustValue(playthroughId, characterId, axisId, operation, amount) {
  const axis = getAxis(axisId);
  const current = getValue(playthroughId, characterId, axisId);
  let next = current;
  if (operation === 'add') next = current + amount;
  else if (operation === 'subtract') next = current - amount;
  else if (operation === 'set') next = amount;
  next = clamp(next, axis);

  db.prepare(
    `INSERT INTO relationship_states (playthrough_id, character_id, relationship_axis_id, current_value)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (playthrough_id, character_id, relationship_axis_id) DO UPDATE SET current_value = excluded.current_value`,
  ).run(playthroughId, characterId, axisId, next);

  return next;
}
