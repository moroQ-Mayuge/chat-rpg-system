import { db } from '../connection.js';
import { listOutfitsForCharacter, createOutfit } from './outfitsRepo.js';
import { listWorldIdsForCharacter, listTagDerivedWorldIdsByCharacter } from './worldRoomSlotAssignmentsRepo.js';
import { listWorldsForCharacter } from './worldCharactersRepo.js';

export const CHARACTER_TEXT_FIELDS = [
  'name',
  'full_name',
  'full_name_reading',
  'nickname',
  'occupation',
  'gender',
  'age_real',
  'age_apparent',
  'race',
  'attribute',
  'appearance_features',
  'eye_description',
  'hair_description',
  'body_type',
  'bust_description',
  'physical_features',
  'main_features',
  'hairstyle',
  'first_person',
  'call_user_as',
  'call_others_as',
  'personality',
  'speech_style',
  'sentence_ending',
  'behavior_principle',
  'social_tendency',
  'habits',
  'likes',
  'dislikes',
  'skills',
  'special_skills',
  'weakness',
  'secret',
  'notes',
  'attribute_tags',
  'underwear_preference_tags',
];

function attachAssociations(character) {
  if (!character) return character;
  const relationshipDefaults = db
    .prepare(
      `SELECT crd.relationship_axis_id, ra.name AS axis_name, ra.min_value, ra.max_value, crd.initial_value
       FROM character_relationship_defaults crd
       JOIN relationship_axes ra ON ra.id = crd.relationship_axis_id
       WHERE crd.character_id = ?`,
    )
    .all(character.id);
  const impressionDefaults = db
    .prepare('SELECT id, field_key, default_value FROM character_impression_defaults WHERE character_id = ? ORDER BY id ASC')
    .all(character.id);
  const outfits = listOutfitsForCharacter(character.id);
  return { ...character, relationship_defaults: relationshipDefaults, impression_defaults: impressionDefaults, outfits };
}

// origin_playthrough_name: ルート固有キャラ(0079)がどのルートのものかを一覧で
// 見せるため。World 所属の導出(world_ids)は絞っていない——自動作成キャラも実際に
// その World のキャラなので、World で絞り込んだときに見えなくなる方が不便。
// 区別はクライアント側のバッジと絞り込みトグルで付ける。
export function listCharacters() {
  const rows = db
    .prepare(
      `SELECT c.*, p.name AS origin_playthrough_name
       FROM characters c
       LEFT JOIN playthroughs p ON p.id = c.origin_playthrough_id
       ORDER BY c.name ASC`,
    )
    .all();
  // Computed once for the whole list (not per character) -- see its own
  // comment in worldRoomSlotAssignmentsRepo.js for why that matters.
  const tagDerivedWorldIds = listTagDerivedWorldIdsByCharacter();
  return rows.map((row) => {
    const defaultOutfit = db
      .prepare('SELECT standing_image_path FROM outfits WHERE character_id = ? AND is_default = 1')
      .get(row.id);
    const world_ids = [
      ...new Set([
        ...listWorldIdsForCharacter(row.id),
        ...(tagDerivedWorldIds.get(row.id) ?? []),
        ...listWorldsForCharacter(row.id).map((w) => w.id),
      ]),
    ];
    return {
      ...row,
      default_outfit_standing_image: defaultOutfit?.standing_image_path ?? null,
      world_ids,
    };
  });
}

export function getCharacter(id) {
  return attachAssociations(db.prepare('SELECT * FROM characters WHERE id = ?').get(id));
}

// composeWornOutfit()(outfitComposition.js)の合成用。ホットパス(画像生成の
// 度に呼ばれる)なので attachAssociations 込みの getCharacter は使わず、
// 必要な2列だけを引く。
export function getCharacterBodyTags(id) {
  return db.prepare('SELECT main_features, hairstyle FROM characters WHERE id = ?').get(id);
}

// underwearAssignment.js の日次抽選用。好みタグ以外は不要なので同じく軽量に。
export function getCharacterUnderwearPreference(id) {
  return db.prepare('SELECT underwear_preference_tags FROM characters WHERE id = ?').get(id);
}

function replaceRelationshipDefaults(characterId, relationshipDefaults) {
  const axes = db.prepare('SELECT * FROM relationship_axes').all();
  db.prepare('DELETE FROM character_relationship_defaults WHERE character_id = ?').run(characterId);
  for (const axis of axes) {
    const override = relationshipDefaults?.find((d) => d.relationship_axis_id === axis.id);
    const initialValue = override ? override.initial_value : axis.default_value;
    db.prepare(
      'INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value) VALUES (?, ?, ?)',
    ).run(characterId, axis.id, initialValue);
  }
}

// Freeform (no fixed catalog, unlike relationship_defaults) -- just a
// delete-and-reinsert of whatever {field_key, default_value} rows the client
// sent, same convention as event_conditions/event_actions. Reinsertion order
// doubles as display order (no separate order column needed).
function replaceImpressionDefaults(characterId, impressionDefaults) {
  db.prepare('DELETE FROM character_impression_defaults WHERE character_id = ?').run(characterId);
  for (const d of impressionDefaults ?? []) {
    if (!d.field_key?.trim()) continue;
    db.prepare('INSERT INTO character_impression_defaults (character_id, field_key, default_value) VALUES (?, ?, ?)').run(
      characterId,
      d.field_key,
      d.default_value ?? '',
    );
  }
}

function buildFieldValues(data) {
  const values = {};
  for (const field of CHARACTER_TEXT_FIELDS) {
    values[field] = data[field] ?? '';
  }
  return values;
}

export function createCharacter(data) {
  const values = buildFieldValues(data);
  const columns = CHARACTER_TEXT_FIELDS.join(', ');
  const placeholders = CHARACTER_TEXT_FIELDS.map((f) => `@${f}`).join(', ');
  const result = db
    .prepare(
      `INSERT INTO characters (${columns}, event_participation_weight, is_mob, cycle_enabled, cycle_offset_day, origin_playthrough_id, is_auto_created, is_promoted_mob)
       VALUES (${placeholders}, @event_participation_weight, @is_mob, @cycle_enabled, @cycle_offset_day, @origin_playthrough_id, @is_auto_created, @is_promoted_mob)`,
    )
    .run({
      ...values,
      event_participation_weight: data.event_participation_weight ?? 1.0,
      is_mob: data.is_mob ? 1 : 0,
      cycle_enabled: data.cycle_enabled ? 1 : 0,
      cycle_offset_day: data.cycle_offset_day ?? 0,
      // 既定は「作者が手で作った通常キャラ」。ルート固有キャラを作れるのは
      // これを明示的に渡す経路(P7の子キャラ生成、0127のモブ昇格)だけで、
      // バンドルの取り込みや画面からの作成は常に通常キャラになる。
      origin_playthrough_id: data.origin_playthrough_id ?? null,
      is_auto_created: data.is_auto_created ? 1 : 0,
      // モブのお気に入り昇格(0127)由来のキャラだけtrue。キャラエディタから
      // 無条件に除外される(CharactersPage.jsx)。
      is_promoted_mob: data.is_promoted_mob ? 1 : 0,
    });
  const characterId = result.lastInsertRowid;
  replaceRelationshipDefaults(characterId, data.relationship_defaults);
  replaceImpressionDefaults(characterId, data.impression_defaults);
  createOutfit(characterId, { name: '通常', is_default: true });
  return getCharacter(characterId);
}

export function updateCharacter(id, data) {
  const values = buildFieldValues(data);
  const setClause = CHARACTER_TEXT_FIELDS.map((f) => `${f} = @${f}`).join(', ');
  db.prepare(
    `UPDATE characters SET ${setClause}, event_participation_weight = @event_participation_weight, is_mob = @is_mob,
       cycle_enabled = @cycle_enabled, cycle_offset_day = @cycle_offset_day WHERE id = @id`,
  ).run({
    ...values,
    event_participation_weight: data.event_participation_weight ?? 1.0,
    is_mob: data.is_mob ? 1 : 0,
    cycle_enabled: data.cycle_enabled ? 1 : 0,
    cycle_offset_day: data.cycle_offset_day ?? 0,
    id,
  });
  replaceRelationshipDefaults(id, data.relationship_defaults);
  replaceImpressionDefaults(id, data.impression_defaults);
  return getCharacter(id);
}

export function isMobCharacter(characterId) {
  const row = db.prepare('SELECT is_mob FROM characters WHERE id = ?').get(characterId);
  return Boolean(row?.is_mob);
}

export function deleteCharacter(id) {
  db.prepare('DELETE FROM characters WHERE id = ?').run(id);
  return { deleted: true };
}
