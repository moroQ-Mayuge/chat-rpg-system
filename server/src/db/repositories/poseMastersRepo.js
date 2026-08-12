import { db } from '../connection.js';

export function listPoseMasters() {
  return db.prepare('SELECT * FROM pose_masters ORDER BY id ASC').all();
}

export function getPoseMaster(id) {
  return db.prepare('SELECT * FROM pose_masters WHERE id = ?').get(id);
}

export function createPoseMaster({ name, llm_tag_key, danbooru_tag }) {
  const result = db
    .prepare('INSERT INTO pose_masters (name, llm_tag_key, danbooru_tag) VALUES (?, ?, ?)')
    .run(name, llm_tag_key, danbooru_tag ?? '');
  return getPoseMaster(result.lastInsertRowid);
}

export function updatePoseMaster(id, { name, llm_tag_key, danbooru_tag }) {
  db.prepare('UPDATE pose_masters SET name = ?, llm_tag_key = ?, danbooru_tag = ? WHERE id = ?').run(
    name,
    llm_tag_key,
    danbooru_tag ?? '',
    id,
  );
  return getPoseMaster(id);
}

export function deletePoseMaster(id) {
  db.prepare('DELETE FROM pose_masters WHERE id = ?').run(id);
  return { deleted: true };
}
