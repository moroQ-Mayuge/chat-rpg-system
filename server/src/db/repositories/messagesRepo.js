import { db } from '../connection.js';
import { touchRoomSession } from './roomSessionsRepo.js';
import { advanceTime } from './playthroughsRepo.js';

function attachImagePath(message) {
  if (!message) return message;
  let result = message;
  if (result.content_type === 'image' && result.image_id) {
    const image = db.prepare('SELECT file_path FROM generated_images WHERE id = ?').get(result.image_id);
    result = { ...result, image_path: image?.file_path ?? null };
  }
  if (result.mentioned_character_ids) {
    result = { ...result, mentioned_character_ids: JSON.parse(result.mentioned_character_ids) };
  }
  return result;
}

export function listMessagesForSession(sessionId) {
  return db
    .prepare('SELECT * FROM messages WHERE room_session_id = ? ORDER BY id ASC')
    .all(sessionId)
    .map(attachImagePath);
}

export function createMessage(
  sessionId,
  { sender_type, character_id = null, content_type = 'text', content = null, image_id = null, emotion_tag = null, mentioned_character_ids = null },
) {
  const result = db
    .prepare(
      `INSERT INTO messages (room_session_id, sender_type, character_id, content_type, content, image_id, emotion_tag, mentioned_character_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      sessionId,
      sender_type,
      character_id,
      content_type,
      content,
      image_id,
      emotion_tag,
      mentioned_character_ids ? JSON.stringify(mentioned_character_ids) : null,
    );
  touchRoomSession(sessionId);
  maybeAutoAdvanceTime(sessionId);
  return attachImagePath(db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid));
}

// Cumulative user-turn count across every room session belonging to this
// playthrough (route) — the "playthrough_start" turn_count reference in
// SPEC.md 3.6.3, distinct from turns_per_time_slot's per-room counter.
export function countUserTurnsForPlaythrough(playthroughId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS c FROM messages m
       JOIN room_sessions rs ON rs.id = m.room_session_id
       WHERE rs.playthrough_id = ? AND m.sender_type = 'user'`,
    )
    .get(playthroughId).c;
}

// Turn-count-based time advancement trigger (SPEC.md 3.2/3.3): if the room template
// has turns_per_time_slot set, advance the playthrough's calendar once every N user turns.
function maybeAutoAdvanceTime(sessionId) {
  const session = db.prepare('SELECT * FROM room_sessions WHERE id = ?').get(sessionId);
  if (session.status !== 'active') return;
  const template = db.prepare('SELECT turns_per_time_slot FROM room_templates WHERE id = ?').get(session.room_template_id);
  if (!template.turns_per_time_slot) return;
  const userTurnCount = db
    .prepare("SELECT COUNT(*) AS c FROM messages WHERE room_session_id = ? AND sender_type = 'user'")
    .get(sessionId).c;
  if (userTurnCount > 0 && userTurnCount % template.turns_per_time_slot === 0) {
    advanceTime(session.playthrough_id, 1);
  }
}
