import { getPlaythrough } from '../db/repositories/playthroughsRepo.js';
import { createRoomSession, endSessionForMove } from '../db/repositories/roomSessionsRepo.js';
import { maybeRunRelationshipAutoUpdate } from './relationshipAutoUpdate.js';
import { maybeRunImpressionAutoUpdate } from './impressionAutoUpdate.js';
import { maybeRunMemoryAutoExtract } from './memoryAutoExtract.js';

// 継続セッション(worlds.continuous_room_session_enabled、0121)での「セッションの
// 切れ目」。部屋の移動ではセッションを畳まない代わりに、**時間帯が変わった時**を
// 唯一の区切りにする(1セッション＝「放課後の出来事」のような物語上の1場面)。
//
// 時間帯は移動コストの累積・turns_per_time_slotのターン数・時間跳躍イベントの
// どれでも進むので、判定はどれが進めたかを問わず「セッション開始時点の暦」と
// 「今の暦」の比較だけで行う。
export function hasCrossedTimeSlotBoundary(session, playthrough) {
  return (
    playthrough.current_day !== session.entered_day ||
    playthrough.current_time_slot_index !== session.entered_time_slot_index
  );
}

// 同じ部屋に居るまま時間帯が変わった場合に、セッションを畳んで同じ部屋で新しい
// セッションを開き直す。移動を伴う切り替えは /move 側で処理するので、こちらは
// ターン数による自動進行や時間跳躍イベントの後始末が対象。
//
// 戻り値: 切り替えたら新しいセッション、何もしなければ null。
export async function maybeCloseSessionOnTimeSlotChange(session, world, { broadcast } = {}) {
  if (!world.continuous_room_session_enabled) return null;
  if (!session || session.status !== 'active') return null;

  const playthrough = getPlaythrough(session.playthrough_id);
  if (!hasCrossedTimeSlotBoundary(session, playthrough)) return null;

  // 場面が終わる時にやることは /exit・/move と同じ(この3つが揃って初めて
  // 「セッション終了時に走る処理」が漏れなく走る)。
  await maybeRunRelationshipAutoUpdate(session, world, { force: true });
  await maybeRunImpressionAutoUpdate(session, world);
  await maybeRunMemoryAutoExtract(session, world);

  const carryOverParticipants = (session.participants ?? [])
    .filter((p) => p.is_accompanying)
    .map((p) => ({ character_id: p.character_id, current_outfit_id: p.current_outfit_id }));

  endSessionForMove(session.id);
  const newSession = createRoomSession(session.playthrough_id, session.room_template_id, {
    carryOverParticipants,
    fromRoomSessionId: session.id,
  });

  // クライアントに「別セッションへ移れ」と伝える経路は forceRoomTransfer 用に
  // 既にあるので、型ごとそのまま流用する(クライアント側の追加実装が要らない)。
  if (broadcast) {
    broadcast(session.id, { type: 'forced_room_transfer', new_session_id: newSession.id });
  }
  return newSession;
}
