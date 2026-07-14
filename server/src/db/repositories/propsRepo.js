import { db } from '../connection.js';

export function listProps() {
  return db.prepare('SELECT * FROM props ORDER BY name ASC').all();
}

export function listPropsForCategory(categoryId) {
  return db.prepare('SELECT * FROM props WHERE category_id = ? ORDER BY name ASC').all(categoryId);
}

export function getProp(id) {
  return db.prepare('SELECT * FROM props WHERE id = ?').get(id);
}

export function createProp({ name, danbooru_tags, category_id, description }) {
  const result = db
    .prepare('INSERT INTO props (name, danbooru_tags, category_id, description) VALUES (?, ?, ?, ?)')
    .run(name, danbooru_tags ?? '', category_id ?? null, description ?? null);
  return getProp(result.lastInsertRowid);
}

export function updateProp(id, { name, danbooru_tags, category_id, description }) {
  db.prepare('UPDATE props SET name = ?, danbooru_tags = ?, category_id = ?, description = ? WHERE id = ?').run(
    name,
    danbooru_tags ?? '',
    category_id ?? null,
    description ?? null,
    id,
  );
  return getProp(id);
}

export function deleteProp(id) {
  db.prepare('DELETE FROM props WHERE id = ?').run(id);
  return { deleted: true };
}
