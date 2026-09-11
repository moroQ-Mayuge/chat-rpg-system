import { db } from '../connection.js';

// 苗字のみの独立プール(World単位)。mobNamePresetsRepo.js(下の名前)・
// mobFlavorPresetsRepo.js(性格・口調)のいずれとも紐付いておらず、部屋登場時に
// それぞれ別個に抽選して組み合わせる(0130)。
function parseSurnamePreset(row) {
  if (!row) return row;
  return { ...row, is_generated: Boolean(row.is_generated) };
}

export function listMobSurnamePresetsForWorld(worldId) {
  return db.prepare('SELECT * FROM mob_surname_presets WHERE world_id = ? ORDER BY id ASC').all(worldId).map(parseSurnamePreset);
}

export function getMobSurnamePreset(id) {
  return parseSurnamePreset(db.prepare('SELECT * FROM mob_surname_presets WHERE id = ?').get(id));
}

export function createMobSurnamePreset({ world_id, surname, is_generated = false }) {
  const result = db
    .prepare('INSERT INTO mob_surname_presets (world_id, surname, is_generated) VALUES (?, ?, ?)')
    .run(world_id, surname, is_generated ? 1 : 0);
  return getMobSurnamePreset(result.lastInsertRowid);
}

export function updateMobSurnamePreset(id, { surname }) {
  db.prepare('UPDATE mob_surname_presets SET surname = ? WHERE id = ?').run(surname, id);
  return getMobSurnamePreset(id);
}

export function deleteMobSurnamePreset(id) {
  db.prepare('DELETE FROM mob_surname_presets WHERE id = ?').run(id);
  return { deleted: true };
}

// 部屋登場時のランダム抽選用。mobNamePresetsRepo.jsのpickRandomMobNamePresetと
// 同じ「JSで配列からMath.random抽選」スタイル。1件も無ければnull(呼び出し元は
// 苗字を付与しない=下の名前だけ、または元のモブ名のまま)。
export function pickRandomMobSurnamePreset(worldId) {
  const surnames = listMobSurnamePresetsForWorld(worldId);
  if (surnames.length === 0) return null;
  return surnames[Math.floor(Math.random() * surnames.length)];
}
