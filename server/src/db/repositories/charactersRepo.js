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

export function listCharacters() {
  const rows = db.prepare('SELECT * FROM characters ORDER BY name ASC').all();
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
      `INSERT INTO characters (${columns}, event_participation_weight, is_mob) VALUES (${placeholders}, @event_participation_weight, @is_mob)`,
    )
    .run({ ...values, event_participation_weight: data.event_participation_weight ?? 1.0, is_mob: data.is_mob ? 1 : 0 });
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
    `UPDATE characters SET ${setClause}, event_participation_weight = @event_participation_weight, is_mob = @is_mob WHERE id = @id`,
  ).run({
    ...values,
    event_participation_weight: data.event_participation_weight ?? 1.0,
    is_mob: data.is_mob ? 1 : 0,
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
