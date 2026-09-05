import { getRoomSession } from '../../../db/repositories/roomSessionsRepo.js';
import { getPlaythrough } from '../../../db/repositories/playthroughsRepo.js';
import { getWorld } from '../../../db/repositories/worldsRepo.js';
import { closeAndReopenSession } from '../../sessionBoundary.js';
import { withSessionLock } from '../../sessionLock.js';
import { broadcast } from '../../../ws/rooms.js';

// { target_room_template_id: number, carry_character_ids?: number[] }
// POST /:id/moveの強制版: room_connectionsの導線チェックとapplyMovementCostを
// 行わない（イベント側の強制移動には導線も移動コストも不要——例: 逮捕されて
// 留置場へ連行される）。carry_character_idsは同行させるキャラ（例: 連行する
// 警官）で、現在の衣装(current_outfit_id)を引き継いで新セッションへ持ち込む
// （/moveのcarryOverParticipants組み立てと同じ形）。
//
// 0122でend_sessionと同じ共通ヘルパー(closeAndReopenSession)経由に書き換え
// ——挙動変化として、強制移動でも場面終了時フック(関係値/印象/記憶の更新)が
// 走るようになった。carry_character_idsのみを引き継ぐ点は変えていない
// (is_accompanyingの自動引き継ぎはend_session側だけの挙動)。
//
// イベントエンジンはセッションロックの外で走るため(roomSessions.jsの
// generateReply参照)、ここで自分でロックを取る。
export async function executeForceRoomTransfer(params, execCtx) {
  const { target_room_template_id, carry_character_ids } = params;
  if (target_room_template_id == null) return { skipped: true, reason: 'no_target_room' };

  return withSessionLock(execCtx.sessionId, async () => {
    const session = getRoomSession(execCtx.sessionId);
    if (!session || session.status !== 'active') return { skipped: true, reason: 'session_not_active' };

    const carryIds = new Set(carry_character_ids ?? []);
    const carryOverParticipants = session.participants
      .filter((p) => carryIds.has(p.character_id))
      .map((p) => ({ character_id: p.character_id, current_outfit_id: p.current_outfit_id }));

    const world = getWorld(getPlaythrough(execCtx.playthroughId).world_id);
    const newSession = await closeAndReopenSession(session, world, {
      targetRoomTemplateId: target_room_template_id,
      carryOverParticipants,
      broadcast,
      reason: 'force_room_transfer',
    });
    return { new_session_id: newSession.id, target_room_template_id };
  });
}
