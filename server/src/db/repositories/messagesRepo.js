import { db } from '../connection.js';
import { touchRoomSession } from './roomSessionsRepo.js';
import { advanceTime } from './playthroughsRepo.js';
import { buildStatusSnapshot } from './statusSnapshotRepo.js';

function attachImagePath(message) {
  if (!message) return message;
  let result = message;
  if (result.content_type === 'image' && result.image_id) {
    const image = db.prepare('SELECT file_path, prompt FROM generated_images WHERE id = ?').get(result.image_id);
    result = { ...result, image_path: image?.file_path ?? null, prompt: image?.prompt ?? null };
  }
  if (result.mentioned_character_ids) {
    result = { ...result, mentioned_character_ids: JSON.parse(result.mentioned_character_ids) };
  }
  if (result.status_snapshot) {
    result = { ...result, status_snapshot: JSON.parse(result.status_snapshot) };
  }
  return result;
}

export function listMessagesForSession(sessionId) {
  return db
    .prepare('SELECT * FROM messages WHERE room_session_id = ? ORDER BY id ASC')
    .all(sessionId)
    .map(attachImagePath);
}

// A character's status_snapshot freezes their game-state values at the
// moment they spoke — チャット欄の顔アイコン付近のログ表示はこれを使う（現在値
// ではなく発言時点の値なので、後でステータスが変わっても過去メッセージの
// 表示は変わらない）。narration/user/system messages never carry one.
// room_session_character_id is transient (not a messages column) -- only
// used to build the right instance's snapshot when a duplicate mob instance
// spoke (see room_slot_row_level_random_and_mob_duplication); non-mob
// characters ignore it entirely (buildStatusSnapshot -> relationshipStatesRepo.js
// etc. no-op it), so passing undefined is always safe.
function buildMessageStatusSnapshot(sessionId, sender_type, character_id, roomSessionCharacterId) {
  if (sender_type !== 'character' || character_id == null) return null;
  const { playthrough_id } = db.prepare('SELECT playthrough_id FROM room_sessions WHERE id = ?').get(sessionId);
  return JSON.stringify(buildStatusSnapshot(playthrough_id, character_id, { roomSessionId: sessionId, roomSessionCharacterId }));
}

export function createMessage(
  sessionId,
  {
    sender_type,
    character_id = null,
    content_type = 'text',
    content = null,
    image_id = null,
    emotion_tag = null,
    mentioned_character_ids = null,
    room_session_character_id = null,
  },
) {
  const status_snapshot = buildMessageStatusSnapshot(sessionId, sender_type, character_id, room_session_character_id);
  const result = db
    .prepare(
      `INSERT INTO messages (room_session_id, sender_type, character_id, content_type, content, image_id, emotion_tag, mentioned_character_ids, status_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      status_snapshot,
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
