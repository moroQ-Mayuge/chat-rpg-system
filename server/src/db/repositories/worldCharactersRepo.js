import { db } from '../connection.js';

// Explicit, author-controlled World membership for a character -- same shape
// as world_room_templates.js/world_character_statuses (characterStatusesRepo.js).
// This is additive alongside charactersRepo.js's two existing DERIVED
// world_ids sources (fixed world_room_slot_assignments rows, attribute-tag
// matching): a character with no row here simply relies on those derivations
// for "所属World" grouping, it isn't left un-groupable.
export function listWorldsForCharacter(characterId) {
  return db
    .prepare(
      `SELECT w.* FROM worlds w
       JOIN world_characters wc ON wc.world_id = w.id
       WHERE wc.character_id = ?
       ORDER BY w.name ASC`,
    )
    .all(characterId);
}

export function listCharactersForWorld(worldId) {
  return db
    .prepare(
      `SELECT c.* FROM characters c
       JOIN world_characters wc ON wc.character_id = c.id
       WHERE wc.world_id = ?
       ORDER BY c.name ASC`,
    )
    .all(worldId);
}

export function attachCharacterToWorld(worldId, characterId) {
  db.prepare('INSERT OR IGNORE INTO world_characters (world_id, character_id) VALUES (?, ?)').run(worldId, characterId);
  return { attached: true };
}

export function detachCharacterFromWorld(worldId, characterId) {
  db.prepare('DELETE FROM world_characters WHERE world_id = ? AND character_id = ?').run(worldId, characterId);
  return { detached: true };
}
