import { db } from '../connection.js';

// 名前のみの独立プール(World単位)。mobFlavorPresetsRepo.js(性格・口調)とは
// 紐付いておらず、部屋登場時にそれぞれ別個に抽選して組み合わせる(0129)。
function parseNamePreset(row) {
  if (!row) return row;
  return { ...row, is_generated: Boolean(row.is_generated) };
}

export function listMobNamePresetsForWorld(worldId) {
  return db.prepare('SELECT * FROM mob_name_presets WHERE world_id = ? ORDER BY id ASC').all(worldId).map(parseNamePreset);
}

export function getMobNamePreset(id) {
  return parseNamePreset(db.prepare('SELECT * FROM mob_name_presets WHERE id = ?').get(id));
}

export function createMobNamePreset({ world_id, name, is_generated = false }) {
  const result = db
    .prepare('INSERT INTO mob_name_presets (world_id, name, is_generated) VALUES (?, ?, ?)')
    .run(world_id, name, is_generated ? 1 : 0);
  return getMobNamePreset(result.lastInsertRowid);
}

export function updateMobNamePreset(id, { name }) {
  db.prepare('UPDATE mob_name_presets SET name = ? WHERE id = ?').run(name, id);
  return getMobNamePreset(id);
}

export function deleteMobNamePreset(id) {
  db.prepare('DELETE FROM mob_name_presets WHERE id = ?').run(id);
  return { deleted: true };
}

// 部屋登場時のランダム抽選用。mobFlavorPresetsRepo.jsのpickRandomMobFlavorPreset
// と同じ「JSで配列からMath.random抽選」スタイル。1件も無ければnull(呼び出し元は
// 名前を付与しない=元のモブ名のまま)。
export function pickRandomMobNamePreset(worldId) {
  const names = listMobNamePresetsForWorld(worldId);
  if (names.length === 0) return null;
  return names[Math.floor(Math.random() * names.length)];
}
