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

// options.day: セッション境界モード(0122)の「切らない」モード等で、当日分
// (またはvoid指定の過去の1日分)だけに絞り込む。省略時は全件(従来どおり)。
export function listMessagesForSession(sessionId, { day = null } = {}) {
  const sql =
    day != null
      ? 'SELECT * FROM messages WHERE room_session_id = ? AND game_day = ? ORDER BY id ASC'
      : 'SELECT * FROM messages WHERE room_session_id = ? ORDER BY id ASC';
  const rows = day != null ? db.prepare(sql).all(sessionId, day) : db.prepare(sql).all(sessionId);
  return rows.map(attachImagePath);
}

// そのセッションのログが実際にまたいでいる日の一覧(昇順)。「前の日のログ」
// リンクや履歴一覧での日分割に使う。
export function listLogDaysForSession(sessionId) {
  return db
    .prepare('SELECT DISTINCT game_day FROM messages WHERE room_session_id = ? AND game_day IS NOT NULL ORDER BY game_day ASC')
    .all(sessionId)
    .map((r) => r.game_day);
}

// A character's status_snapshot freezes their game-state values at the
// moment they spoke — チャット欄の顔アイコン付近のログ表示はこれを使う（現在値
// ではなく発言時点の値なので、後でステータスが変わっても過去メッセージの
// 表示は変わらない）。narration/user/system messages never carry one.
// roomSessionCharacterId is also used to build the right instance's snapshot
// when a duplicate mob instance spoke (see
// room_slot_row_level_random_and_mob_duplication); non-mob characters ignore
// it entirely (buildStatusSnapshot -> relationshipStatesRepo.js etc. no-op
// it), so passing undefined is always safe. It's ALSO now persisted on the
// message itself (messages.room_session_character_id, migration 0132) --
// unlike character_id, this stays stable even if the participant row is
// later repointed to a different character (mob favorite promotion), so
// history/chat-log name+icon resolution should prefer it over character_id.
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
  // game_day(0122)はroom_sessions.log_dayから写す(暦のcurrent_dayではない) ——
  // turns_per_time_slotがユーザー行の直後に暦を進めるため、暦から付けると
  // 同じターンのユーザー発言と応答が別の日に分かれてしまう。log_dayは
  // handleDayRollover(sessionBoundary.js)が区切り行を入れる直前にしか進まない
  // ので、「日」は常に区切り行で挟まれたブロックと一致する。
  const { log_day: logDay, entered_day: enteredDay } = db
    .prepare('SELECT log_day, entered_day FROM room_sessions WHERE id = ?')
    .get(sessionId);
  const gameDay = logDay ?? enteredDay;
  const result = db
    .prepare(
      `INSERT INTO messages (room_session_id, sender_type, character_id, content_type, content, image_id, emotion_tag, mentioned_character_ids, status_snapshot, game_day, room_session_character_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      gameDay,
      room_session_character_id,
    );
  touchRoomSession(sessionId);
  // ユーザーの発言でのみ判定する。narration/characterメッセージは1ターンに
  // 何行も作られるため、全メッセージ種別で呼んでいると userTurnCount が同じ
  // 倍数のまま留まっている間、その全行についてadvanceTime(1)が再発火してしまう
  // (発見時の実害: turns_per_time_slot=2の部屋で1ターンの応答だけで暦が数日
  // 進んだ)。「Nユーザーターンごとに1回」という関数自身のコメントの意図どおり、
  // ユーザーメッセージの作成時だけに絞る。
  if (sender_type === 'user') {
    maybeAutoAdvanceTime(sessionId);
  }
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

// このセッション内だけのユーザーターン数(countUserTurnsForPlaythroughのセッション版)。
// session_max_turns(0122、1場面の最大ターン数)の判定に使う。
export function countUserTurnsForSession(sessionId) {
  return db.prepare("SELECT COUNT(*) AS c FROM messages WHERE room_session_id = ? AND sender_type = 'user'").get(sessionId).c;
}

// Turn-count-based time advancement trigger (SPEC.md 3.2/3.3): if the room template
// has turns_per_time_slot set, advance the playthrough's calendar once every N user turns.
function maybeAutoAdvanceTime(sessionId) {
  const session = db.prepare('SELECT * FROM room_sessions WHERE id = ?').get(sessionId);
  if (session.status !== 'active') return;
  const template = db.prepare('SELECT turns_per_time_slot FROM room_templates WHERE id = ?').get(session.room_template_id);
  if (!template.turns_per_time_slot) return;
  const userTurnCount = countUserTurnsForSession(sessionId);
  if (userTurnCount > 0 && userTurnCount % template.turns_per_time_slot === 0) {
    advanceTime(session.playthrough_id, 1);
  }
}
