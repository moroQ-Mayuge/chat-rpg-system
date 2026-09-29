import { makeItemAvailable } from '../../itemDiscovery.js';

// { item_id } — その部屋で拾える状態にする(0072)。grant_item と違って在庫には
// 入れず、プレイヤーが「拾う」で取る形にする。見つけた旨の文章は作者が
// insert_dialogue で書く想定なので、ここは状態変更だけに留める。
export async function executeMakeItemAvailable(params, execCtx) {
  // execCtx.session.sub_room_id(0150/Stage 3): イベント発火時のプレイヤー位置に
  // 対応するサブ部屋の在庫として置く(部屋全体ではなく今いる場所限定)。
  const item = makeItemAvailable(execCtx.playthroughId, execCtx.roomTemplateId, params.item_id, true, execCtx.session?.sub_room_id);
  return { item_id: params.item_id, already_available: !item };
}
