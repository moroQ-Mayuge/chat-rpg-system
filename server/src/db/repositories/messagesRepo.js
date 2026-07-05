import { db } from '../connection.js';
import { touchRoomSession } from './roomSessionsRepo.js';
import { advanceTime } from './playthroughsRepo.js';

export function listMessagesForSession(sessionId) {
  return db
    .prepare('SELECT * FROM messages WHERE room_session_id = ? ORDER BY id ASC')
    .all(sessionId);
}

export function createMessage(sessionId, { sender_type, character_id = null, content_type = 'text', content = null, image_id = null, emotion_tag = null }) {
  const result = db
    .prepare(
      `INSERT INTO messages (room_session_id, sender_type, character_id, content_type, content, image_id, emotion_tag)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(sessionId, sender_type, character_id, content_type, content, image_id, emotion_tag);
  touchRoomSession(sessionId);
  maybeAutoAdvanceTime(sessionId);
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
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
