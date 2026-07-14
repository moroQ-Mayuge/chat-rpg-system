import { db } from '../connection.js';

export function listExpressionTypes() {
  return db.prepare('SELECT * FROM expression_types ORDER BY id ASC').all();
}

export function getExpressionType(id) {
  return db.prepare('SELECT * FROM expression_types WHERE id = ?').get(id);
}

export function createExpressionType({ name, llm_tag_key, danbooru_tag }) {
  const result = db
    .prepare('INSERT INTO expression_types (name, llm_tag_key, danbooru_tag) VALUES (?, ?, ?)')
    .run(name, llm_tag_key, danbooru_tag ?? '');
  return getExpressionType(result.lastInsertRowid);
}

export function updateExpressionType(id, { name, llm_tag_key, danbooru_tag }) {
  db.prepare('UPDATE expression_types SET name = ?, llm_tag_key = ?, danbooru_tag = ? WHERE id = ?').run(
    name,
    llm_tag_key,
    danbooru_tag ?? '',
    id,
  );
  return getExpressionType(id);
}

export function deleteExpressionType(id) {
  db.prepare('DELETE FROM expression_types WHERE id = ?').run(id);
  return { deleted: true };
}
