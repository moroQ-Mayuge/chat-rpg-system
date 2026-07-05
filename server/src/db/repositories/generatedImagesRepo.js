import { db } from '../connection.js';

export function createGeneratedImage({ roomSessionId, type, characterId = null, prompt, filePath }) {
  const result = db
    .prepare('INSERT INTO generated_images (room_session_id, type, character_id, prompt, file_path) VALUES (?, ?, ?, ?, ?)')
    .run(roomSessionId, type, characterId, prompt, filePath);
  return db.prepare('SELECT * FROM generated_images WHERE id = ?').get(result.lastInsertRowid);
}

export function getGeneratedImage(id) {
  return db.prepare('SELECT * FROM generated_images WHERE id = ?').get(id);
}
