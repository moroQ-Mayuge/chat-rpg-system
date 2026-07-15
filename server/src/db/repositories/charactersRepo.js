import { db } from '../connection.js';
import { listOutfitsForCharacter, createOutfit } from './outfitsRepo.js';
import { listWorldIdsForCharacter } from './worldRoomSlotAssignmentsRepo.js';

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
  const outfits = listOutfitsForCharacter(character.id);
  return { ...character, relationship_defaults: relationshipDefaults, outfits };
}

export function listCharacters() {
  const rows = db.prepare('SELECT * FROM characters ORDER BY name ASC').all();
  return rows.map((row) => {
    const defaultOutfit = db
      .prepare('SELECT standing_image_path FROM outfits WHERE character_id = ? AND is_default = 1')
      .get(row.id);
    return {
      ...row,
      default_outfit_standing_image: defaultOutfit?.standing_image_path ?? null,
      world_ids: listWorldIdsForCharacter(row.id),
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
      `INSERT INTO characters (${columns}, event_participation_weight) VALUES (${placeholders}, @event_participation_weight)`,
    )
    .run({ ...values, event_participation_weight: data.event_participation_weight ?? 1.0 });
  const characterId = result.lastInsertRowid;
  replaceRelationshipDefaults(characterId, data.relationship_defaults);
  createOutfit(characterId, { name: '通常', is_default: true });
  return getCharacter(characterId);
}

export function updateCharacter(id, data) {
  const values = buildFieldValues(data);
  const setClause = CHARACTER_TEXT_FIELDS.map((f) => `${f} = @${f}`).join(', ');
  db.prepare(`UPDATE characters SET ${setClause}, event_participation_weight = @event_participation_weight WHERE id = @id`).run(
    {
      ...values,
      event_participation_weight: data.event_participation_weight ?? 1.0,
      id,
    },
  );
  replaceRelationshipDefaults(id, data.relationship_defaults);
  return getCharacter(id);
}

export function deleteCharacter(id) {
  db.prepare('DELETE FROM characters WHERE id = ?').run(id);
  return { deleted: true };
}
