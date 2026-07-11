import { db } from '../connection.js';

export function getCurrentAddress(playthroughId, characterId) {
  const row = db
    .prepare('SELECT current_address FROM character_address_states WHERE playthrough_id = ? AND character_id = ?')
    .get(playthroughId, characterId);
  return row?.current_address ?? null;
}

export function setCurrentAddress(playthroughId, characterId, address) {
  db.prepare(
    `INSERT INTO character_address_states (playthrough_id, character_id, current_address, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT (playthrough_id, character_id) DO UPDATE SET current_address = excluded.current_address, updated_at = excluded.updated_at`,
  ).run(playthroughId, characterId, address);
  return { current_address: address };
}
