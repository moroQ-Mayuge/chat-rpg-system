import { switchSubRoom } from '../../../db/repositories/roomSessionsRepo.js';

// { sub_room_id: number|null } — サブ部屋(0150、Stage 6)。現在のセッションの
// サブ部屋位置を強制的に切り替える。sub_room_id未指定(null)で親部屋本体
// (メイン)へ戻す。set_room_profileと違い対象の部屋を明示指定しない——サブ部屋
// 位置はroom_sessionsのライブな状態そのもので、「今このイベントが動いている
// セッション」以外を対象にする概念が無いため、常にexecCtx.sessionIdを使う。
//
// 実体はチャットの「場所を変える」ボタン(POST /room-sessions/:id/sub-room)と
// 同じswitchSubRoom()を、同伴候補(companionRowIds)を指定せずに呼ぶだけ——
// デート中のキャラは判定なしで自動的について来る(Stage 2b)。@メンションによる
// 同伴判定(Stage 2c)はチャット操作特有の仕組みなので、イベントからの強制切替
// では行わない(同行者以外は全員その場に残る)。ナレーションはこのアクション
// 自身では出さない(set_room_profile/clear_room_profileと同じ「状態変更のみ、
// 文章は作者がinsert_dialogueで書く」方針)。
export async function executeSetSubRoom(params, execCtx) {
  const targetSubRoomId = params.sub_room_id ?? null;
  try {
    switchSubRoom(execCtx.sessionId, targetSubRoomId, { companionRowIds: [] });
  } catch (err) {
    if (err.message === 'sub_room_not_in_room') return { skipped: true, reason: 'sub_room_not_in_room' };
    throw err;
  }
  return { sub_room_id: targetSubRoomId };
}
