import { getPlaythrough } from '../db/repositories/playthroughsRepo.js';
import {
  createRoomSession,
  endSessionForMove,
  getRoomSession,
  setMemoryImpressionCheckpoint,
  setLogDay,
  setBoundaryPending,
} from '../db/repositories/roomSessionsRepo.js';
import { countUserTurnsForPlaythrough, countUserTurnsForSession, createMessage } from '../db/repositories/messagesRepo.js';
import { maybeRunRelationshipAutoUpdate } from './relationshipAutoUpdate.js';
import { maybeRunImpressionAutoUpdate } from './impressionAutoUpdate.js';
import { maybeRunMemoryAutoExtract } from './memoryAutoExtract.js';
import { maybeUpdateConversationSummary } from './conversationSummary.js';
import { promoteAccompanyingFlavoredMobs } from './mobPromotion.js';

// 継続セッション(worlds.continuous_room_session_enabled、0121)の「区切り方」
// (0122)。基本モードを3つから選べる：
//   time_slot: 時間帯が変わったら区切る(0121の元の挙動、既定)
//   day:       日が変わったら区切る
//   never:     区切らない。代わりに日替わりのタイミングで
//              記憶・印象更新とあらすじの畳み込みだけを行う(handleDayRollover)
// さらに、時間帯/日モードには「会話の途中では区切らず次の移動時に区切る」
// (session_boundary_defer_to_move)、モードを問わない追加トリガーとして
// 接続の ends_session・部屋の ends_session_on_enter・event_actionのend_session・
// 1場面の最大ターン数(session_max_turns、常に次の移動時扱い)がある。
export function hasCrossedTimeSlotBoundary(session, playthrough) {
  return (
    playthrough.current_day !== session.entered_day ||
    playthrough.current_time_slot_index !== session.entered_time_slot_index
  );
}

// /exit・closeAndReopenSession・handleDayRolloverが共有する「場面が終わる/
// 区切りを跨ぐ時にやること」。関係値は自身のelapsed<=0ガードで二重実行を防ぐが、
// 記憶・印象は同ターン内で既に走っている(間隔実行や/moveの事前フック)場合は
// 重ねて呼ばないよう、ここでチェックポイントを見てから走らせる。
export async function runEndOfSceneHooks(session, world) {
  const turnNumber = countUserTurnsForPlaythrough(session.playthrough_id);
  await maybeRunRelationshipAutoUpdate(session, world, { force: true });
  if (session.memory_impression_last_turn < turnNumber) {
    await maybeRunImpressionAutoUpdate(session, world);
    await maybeRunMemoryAutoExtract(session, world);
    setMemoryImpressionCheckpoint(session.id, turnNumber);
  }
}

// このセッションを今区切るべきか判定する。isMove=trueの時だけ接続/部屋の
// トリガーと保留中の区切りを見る(会話の途中では発火させない)。
// 戻り値: { cut, reason, defer }。deferは「区切るべきだが会話の途中なので
// 保留し、次の移動時に区切る」。
export function evaluateBoundary(session, world, playthrough, { connection = null, toRoom = null, isMove = false } = {}) {
  if (!world.continuous_room_session_enabled) {
    return { cut: isMove, reason: isMove ? 'legacy_move' : null, defer: false };
  }
  if (isMove && connection?.ends_session) return { cut: true, reason: 'connection', defer: false };
  if (isMove && toRoom?.ends_session_on_enter) return { cut: true, reason: 'room_enter', defer: false };
  if (isMove && session.boundary_pending) return { cut: true, reason: session.boundary_pending, defer: false };

  const mode = world.session_boundary_mode ?? 'time_slot';
  let reason = null;
  if (mode === 'time_slot' && hasCrossedTimeSlotBoundary(session, playthrough)) {
    reason = 'time_slot';
  } else if (mode === 'day' && playthrough.current_day !== session.log_day) {
    reason = 'day';
  }
  if (!reason && world.session_max_turns > 0 && countUserTurnsForSession(session.id) >= world.session_max_turns) {
    reason = 'max_turns';
  }
  if (!reason) return { cut: false, reason: null, defer: false };

  // 最大ターン数は常に「会話の途中では切らない」扱い。時間帯/日モードは
  // World設定(session_boundary_defer_to_move)に従う。
  const defer = !isMove && (reason === 'max_turns' || Boolean(world.session_boundary_defer_to_move));
  return { cut: !defer, reason, defer };
}

// セッションを畳んで新しいセッションを開き直す。targetRoomTemplateIdを省略
// すると同じ部屋で再開(時間帯/日モードの通常の切れ目、イベントのend_session
// でターゲット省略時)。carryOverParticipants省略時はis_accompanyingの参加者を
// 自動で引き継ぐ(force_room_transferのように明示指定したい呼び出し元は渡す)。
export async function closeAndReopenSession(
  session,
  world,
  { targetRoomTemplateId = null, carryOverParticipants = null, broadcast = null, reason = null } = {},
) {
  // 同行キャラが次のセッションへ引き継がれる直前——ランダムペルソナ付きの
  // モブがいれば自動でお気に入りキャラとして実体化する(0128フォローアップ)。
  // character_idが変わるインスタンスがあり得るため、以後は必ずこの戻り値の
  // sessionを使う。carryOverParticipantsを呼び出し元が明示的に渡してくる
  // 場合(end_session/force_room_transfer)は、その組み立てより前に各自でも
  // 同じ関数を呼んでいる(二重呼び出しは対象0件で即returnするだけなので無害)。
  session = await promoteAccompanyingFlavoredMobs(session, world);
  await runEndOfSceneHooks(session, world);

  const carry =
    carryOverParticipants ??
    (session.participants ?? [])
      .filter((p) => p.is_accompanying)
      .map((p) => ({
        character_id: p.character_id,
        current_outfit_id: p.current_outfit_id,
        current_transformation_id: p.current_transformation_id,
        mob_flavor_preset_id: p.mob_flavor_preset_id,
      }));

  endSessionForMove(session.id);
  const newSession = createRoomSession(session.playthrough_id, targetRoomTemplateId ?? session.room_template_id, {
    carryOverParticipants: carry,
    fromRoomSessionId: session.id,
  });

  if (broadcast) {
    broadcast(session.id, { type: 'forced_room_transfer', new_session_id: newSession.id, reason });
  }
  return newSession;
}

// 「区切らない」モード、または区切りを保留中のセッションで、日が変わった時に
// 行う処理。セッションは畳まず、代わりに: 場面終了時と同じフック(記憶・印象・
// 関係値の追いつき)を実行し、あらすじを強制的に畳み込み(区切り行より前を
// 確定させる)、log_dayを進め(以降のメッセージは新しい日として記録される)、
// ログに日替わりの区切り行(narration)を入れる。
export async function handleDayRollover(session, world, playthrough, { broadcast = null } = {}) {
  await runEndOfSceneHooks(session, world);
  await maybeUpdateConversationSummary(getRoomSession(session.id), world, { force: true });
  setLogDay(session.id, playthrough.current_day);

  const dateLabel = playthrough.current_date_label ? `（${playthrough.current_date_label}）` : '';
  const message = createMessage(session.id, {
    sender_type: 'narration',
    content: `―― ${playthrough.current_day}日目${dateLabel} ――`,
  });
  if (broadcast) {
    broadcast(session.id, { type: 'message_complete', message });
  }
}

// 会話ターンの事後フック末尾から呼ぶ(旧maybeCloseSessionOnTimeSlotChangeの
// 置き換え)。/move以外の経路(turns_per_time_slot・時間跳躍イベント等)で
// 時間帯/日/最大ターン数の境界を跨いだ場合の後始末をここで一括して行う。
export async function maybeHandleSessionBoundary(session, world, { broadcast } = {}) {
  if (!world.continuous_room_session_enabled) return null;
  if (!session || session.status !== 'active') return null;

  const playthrough = getPlaythrough(session.playthrough_id);
  const verdict = evaluateBoundary(session, world, playthrough, { isMove: false });

  if (verdict.cut) {
    return closeAndReopenSession(session, world, { broadcast, reason: verdict.reason });
  }
  if (verdict.defer && session.boundary_pending !== verdict.reason) {
    setBoundaryPending(session.id, verdict.reason);
  }
  if (playthrough.current_day !== session.log_day) {
    await handleDayRollover(session, world, playthrough, { broadcast });
  }
  return null;
}
