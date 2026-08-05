import { db } from '../connection.js';

export function getPersistedOutfit(playthroughId, characterId) {
  return db
    .prepare('SELECT * FROM playthrough_character_outfit WHERE playthrough_id = ? AND character_id = ?')
    .get(playthroughId, characterId);
}

export function setPersistedOutfit(playthroughId, characterId, outfitId) {
  db.prepare(
    `INSERT INTO playthrough_character_outfit (playthrough_id, character_id, outfit_id, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT (playthrough_id, character_id) DO UPDATE SET outfit_id = excluded.outfit_id, updated_at = excluded.updated_at`,
  ).run(playthroughId, characterId, outfitId);
  return getPersistedOutfit(playthroughId, characterId);
}
