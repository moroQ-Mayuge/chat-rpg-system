import { db } from '../connection.js';

// World単位の追加印象フィールドテンプレート。character_impression_defaultsと
// 同形だが世界観スコープ——worldCalendarHolidaysRepo.jsと同じ個別CRUDの形。
export function listTemplatesForWorld(worldId) {
  return db.prepare('SELECT * FROM world_impression_field_templates WHERE world_id = ? ORDER BY id ASC').all(worldId);
}

export function getTemplate(id) {
  return db.prepare('SELECT * FROM world_impression_field_templates WHERE id = ?').get(id);
}

export function createTemplate({ world_id, field_key, default_value, update_instruction }) {
  const result = db
    .prepare('INSERT INTO world_impression_field_templates (world_id, field_key, default_value, update_instruction) VALUES (?, ?, ?, ?)')
    .run(world_id, field_key, default_value ?? '', update_instruction ?? '');
  return getTemplate(result.lastInsertRowid);
}

export function updateTemplate(id, { field_key, default_value, update_instruction }) {
  db.prepare('UPDATE world_impression_field_templates SET field_key = ?, default_value = ?, update_instruction = ? WHERE id = ?').run(
    field_key,
    default_value ?? '',
    update_instruction ?? '',
    id,
  );
  return getTemplate(id);
}

export function deleteTemplate(id) {
  db.prepare('DELETE FROM world_impression_field_templates WHERE id = ?').run(id);
  return { deleted: true };
}
