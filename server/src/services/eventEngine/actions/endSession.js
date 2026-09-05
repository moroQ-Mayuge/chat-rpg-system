import { getRoomSession } from '../../../db/repositories/roomSessionsRepo.js';
import { getPlaythrough } from '../../../db/repositories/playthroughsRepo.js';
import { getWorld } from '../../../db/repositories/worldsRepo.js';
import { closeAndReopenSession } from '../../sessionBoundary.js';
import { withSessionLock } from '../../sessionLock.js';
import { broadcast } from '../../../ws/rooms.js';

// { target_room_template_id?: number|null, carry_character_ids?: number[] }
// セッション境界モード(0122)の追加トリガー: 場面をその場で区切って開き直す。
// target_room_template_id省略/nullなら同じ部屋で再開(会話の一区切り、告白成立
// や「今日はここまで」の合意など)。同行中(is_accompanying)の参加者は自動で
// 引き継がれ、carry_character_idsはそれに加えて明示的に連れて行きたいキャラ
// (同行フラグが立っていない者)を指定する。
//
// このアクションを含むイベントの中で後続のアクションを置くと、それらは
// 終了済みセッションを対象にしてしまう——end_sessionはアクション一覧の最後に
// 置くこと(EventsPage.jsxの説明文にも明記)。
//
// イベントエンジンはセッションロックの外で走る(roomSessions.jsのgenerateReply
// 参照、runEventEngineがwithSessionLockより前)ため、ここで自分でロックを取る
// ——同じターンの事後フックや/moveと競合しないようにする。
export async function executeEndSession(params, execCtx) {
  return withSessionLock(execCtx.sessionId, async () => {
    const session = getRoomSession(execCtx.sessionId);
    if (!session || session.status !== 'active') return { skipped: true, reason: 'session_not_active' };

    const world = getWorld(getPlaythrough(execCtx.playthroughId).world_id);
    const carryIds = new Set(params.carry_character_ids ?? []);
    const carryOverParticipants = session.participants
      .filter((p) => p.is_accompanying || carryIds.has(p.character_id))
      .map((p) => ({ character_id: p.character_id, current_outfit_id: p.current_outfit_id }));

    const newSession = await closeAndReopenSession(session, world, {
      targetRoomTemplateId: params.target_room_template_id ?? null,
      carryOverParticipants,
      broadcast,
      reason: 'event',
    });
    return { new_session_id: newSession.id, target_room_template_id: params.target_room_template_id ?? null };
  });
}
