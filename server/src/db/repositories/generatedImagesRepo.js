import { db } from '../connection.js';

export function createGeneratedImage({ roomSessionId, type, characterId = null, prompt, filePath, characterTags = [] }) {
  const result = db
    .prepare('INSERT INTO generated_images (room_session_id, type, character_id, prompt, file_path) VALUES (?, ?, ?, ?, ?)')
    .run(roomSessionId, type, characterId, prompt, filePath);
  const imageId = result.lastInsertRowid;
  recordCharacterTags(imageId, characterTags);
  return db.prepare('SELECT * FROM generated_images WHERE id = ?').get(imageId);
}

export function getGeneratedImage(id) {
  return db.prepare('SELECT * FROM generated_images WHERE id = ?').get(id);
}

// 画像生成時のキャラごとのキャラタグ([{character_id, tags}])を記録する(0162)。
// 「直前の画像のプロンプトを元にする」機能が、前回のプロンプトからそのキャラの分だけを
// 差し替えるために使う。
function recordCharacterTags(imageId, entries) {
  const insert = db.prepare('INSERT OR REPLACE INTO generated_image_character_tags (generated_image_id, character_id, tags) VALUES (?, ?, ?)');
  for (const entry of entries ?? []) {
    if (entry?.character_id == null) continue;
    insert.run(imageId, entry.character_id, entry.tags ?? '');
  }
}

// このセッションで、そのキャラが写った直近の画像(プロンプトとそのキャラの前回のキャラタグ付き)。
// 記録が無い(0162より前に生成された画像のみ・まだ1枚も無い)場合は null。
export function findLatestImageWithCharacter(roomSessionId, characterId) {
  return (
    db
      .prepare(
        `SELECT gi.id, gi.prompt, gict.tags AS character_tags
         FROM generated_images gi
         JOIN generated_image_character_tags gict ON gict.generated_image_id = gi.id
         WHERE gi.room_session_id = ? AND gict.character_id = ?
         ORDER BY gi.id DESC LIMIT 1`,
      )
      .get(roomSessionId, characterId) ?? null
  );
}
