import { db } from '../connection.js';

export function getAssignedUnderwear(playthroughId, characterId) {
  return db
    .prepare('SELECT * FROM playthrough_character_underwear WHERE playthrough_id = ? AND character_id = ?')
    .get(playthroughId, characterId);
}

export function setAssignedUnderwear(playthroughId, characterId, outfitMasterId) {
  db.prepare(
    `INSERT INTO playthrough_character_underwear (playthrough_id, character_id, outfit_master_id, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT (playthrough_id, character_id) DO UPDATE SET outfit_master_id = excluded.outfit_master_id, updated_at = excluded.updated_at`,
  ).run(playthroughId, characterId, outfitMasterId);
  return getAssignedUnderwear(playthroughId, characterId);
}
