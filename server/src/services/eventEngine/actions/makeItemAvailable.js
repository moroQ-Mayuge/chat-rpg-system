import { makeItemAvailable } from '../../itemDiscovery.js';

// { item_id } — その部屋で拾える状態にする(0072)。grant_item と違って在庫には
// 入れず、プレイヤーが「拾う」で取る形にする。見つけた旨の文章は作者が
// insert_dialogue で書く想定なので、ここは状態変更だけに留める。
export async function executeMakeItemAvailable(params, execCtx) {
  const item = makeItemAvailable(execCtx.playthroughId, execCtx.roomTemplateId, params.item_id);
  return { item_id: params.item_id, already_available: !item };
}
