import { db } from '../connection.js';

// PLAN_2026-08-02_outfit_spec_revision.md系の追加要望2 実装順1:
// character_transformations は outfit_masters と同じ「空欄は継承」規約の
// フィールド一覧。outfit_masters と違い character_id 必須(1キャラ専用の
// 変身先であり、複数キャラで共有しない)。
export const CHARACTER_TRANSFORMATION_FIELDS = [
  'name',
  'full_name',
  'nickname',
  'appearance_features',
  'eye_description',
  'hair_description',
  'body_type',
  'bust_description',
  'physical_features',
  'main_features',
  'hairstyle',
  'personality',
  'first_person',
  'speech_style',
  'sentence_ending',
  'skills',
  'special_skills',
];

export function listForCharacter(characterId) {
  return db
    .prepare('SELECT * FROM character_transformations WHERE character_id = ? ORDER BY id ASC')
    .all(characterId);
}

export function getTransformation(id) {
  return db.prepare('SELECT * FROM character_transformations WHERE id = ?').get(id);
}

export function createTransformation(characterId, data) {
  const columns = CHARACTER_TRANSFORMATION_FIELDS.join(', ');
  const placeholders = CHARACTER_TRANSFORMATION_FIELDS.map(() => '?').join(', ');
  const values = CHARACTER_TRANSFORMATION_FIELDS.map((f) => data[f] ?? '');
  const result = db
    .prepare(`INSERT INTO character_transformations (character_id, ${columns}, outfit_master_id) VALUES (?, ${placeholders}, ?)`)
    .run(characterId, ...values, data.outfit_master_id ?? null);
  return getTransformation(result.lastInsertRowid);
}

export function updateTransformation(id, data) {
  const setClause = CHARACTER_TRANSFORMATION_FIELDS.map((f) => `${f} = ?`).join(', ');
  const values = CHARACTER_TRANSFORMATION_FIELDS.map((f) => data[f] ?? '');
  db.prepare(`UPDATE character_transformations SET ${setClause}, outfit_master_id = ? WHERE id = ?`).run(
    ...values,
    data.outfit_master_id ?? null,
    id,
  );
  return getTransformation(id);
}

export function deleteTransformation(id) {
  db.prepare('DELETE FROM character_transformations WHERE id = ?').run(id);
  return { deleted: true };
}
