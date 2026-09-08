import { db } from '../connection.js';

function parsePreset(row) {
  if (!row) return row;
  return { ...row, is_generated: Boolean(row.is_generated) };
}

export function listMobFlavorPresetsForWorld(worldId) {
  return db.prepare('SELECT * FROM mob_flavor_presets WHERE world_id = ? ORDER BY id ASC').all(worldId).map(parsePreset);
}

export function getMobFlavorPreset(id) {
  return parsePreset(db.prepare('SELECT * FROM mob_flavor_presets WHERE id = ?').get(id));
}

export function createMobFlavorPreset({
  world_id,
  name,
  personality = '',
  speech_style = '',
  sentence_ending = '',
  first_person = '',
  call_user_as = '',
  call_others_as = '',
  is_generated = false,
}) {
  const result = db
    .prepare(
      `INSERT INTO mob_flavor_presets
        (world_id, name, personality, speech_style, sentence_ending, first_person, call_user_as, call_others_as, is_generated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(world_id, name, personality, speech_style, sentence_ending, first_person, call_user_as, call_others_as, is_generated ? 1 : 0);
  return getMobFlavorPreset(result.lastInsertRowid);
}

export function updateMobFlavorPreset(
  id,
  { name, personality = '', speech_style = '', sentence_ending = '', first_person = '', call_user_as = '', call_others_as = '' },
) {
  db.prepare(
    `UPDATE mob_flavor_presets
     SET name = ?, personality = ?, speech_style = ?, sentence_ending = ?, first_person = ?, call_user_as = ?, call_others_as = ?
     WHERE id = ?`,
  ).run(name, personality, speech_style, sentence_ending, first_person, call_user_as, call_others_as, id);
  return getMobFlavorPreset(id);
}

export function deleteMobFlavorPreset(id) {
  db.prepare('DELETE FROM mob_flavor_presets WHERE id = ?').run(id);
  return { deleted: true };
}

// 部屋登場時のランダム抽選用。JSで配列から抽選するのは worldRoomSlotAssignmentsRepo.js
// の resolveRandomRows 等と同じスタイル。プリセットが1件も無ければnullを返し、
// 呼び出し元はモブに何も付与しない(既存挙動のまま)。
export function pickRandomMobFlavorPreset(worldId) {
  const presets = listMobFlavorPresetsForWorld(worldId);
  if (presets.length === 0) return null;
  return presets[Math.floor(Math.random() * presets.length)];
}
