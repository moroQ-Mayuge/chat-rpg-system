import { db } from '../connection.js';

export function listRelationshipAxes() {
  return db.prepare('SELECT * FROM relationship_axes ORDER BY id ASC').all();
}

export function getRelationshipAxis(id) {
  return db.prepare('SELECT * FROM relationship_axes WHERE id = ?').get(id);
}

export function createRelationshipAxis({ name, min_value = 0, max_value = 100, default_value = 0 }) {
  const result = db
    .prepare('INSERT INTO relationship_axes (name, min_value, max_value, default_value) VALUES (?, ?, ?, ?)')
    .run(name, min_value, max_value, default_value);
  return getRelationshipAxis(result.lastInsertRowid);
}

export function updateRelationshipAxis(id, { name, min_value, max_value, default_value }) {
  db.prepare('UPDATE relationship_axes SET name = ?, min_value = ?, max_value = ?, default_value = ? WHERE id = ?').run(
    name,
    min_value,
    max_value,
    default_value,
    id,
  );
  return getRelationshipAxis(id);
}

export function deleteRelationshipAxis(id) {
  db.prepare('DELETE FROM relationship_axes WHERE id = ?').run(id);
  return { deleted: true };
}
