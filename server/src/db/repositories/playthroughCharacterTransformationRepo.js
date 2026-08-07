import { db } from '../connection.js';

export function getPersistedTransformation(playthroughId, characterId) {
  return db
    .prepare('SELECT * FROM playthrough_character_transformation WHERE playthrough_id = ? AND character_id = ?')
    .get(playthroughId, characterId);
}

export function setPersistedTransformation(playthroughId, characterId, transformationId) {
  db.prepare(
    `INSERT INTO playthrough_character_transformation (playthrough_id, character_id, transformation_id, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT (playthrough_id, character_id) DO UPDATE SET transformation_id = excluded.transformation_id, updated_at = excluded.updated_at`,
  ).run(playthroughId, characterId, transformationId);
  return getPersistedTransformation(playthroughId, characterId);
}
