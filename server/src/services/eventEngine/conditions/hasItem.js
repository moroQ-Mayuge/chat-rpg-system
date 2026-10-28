import { db } from '../../../db/connection.js';
import { resolveMentionedList } from '../mentionResolution.js';

// { item_id?, item_name_contains?, holder?, mentioned_limit?, negate? }
//  - 対象アイテム: item_id(完全一致)、または item_name_contains(名前の部分一致、
//    「婚約指輪」のように同系統の複数アイテムをまとめて判定したい時用)。両方指定したら両方満たす
//    アイテムのみ。どちらも無ければ不成立。
//  - holder: 誰の持ち物か。省略/null=プレイヤー(従来どおり)、"mentioned"=@メンション中のキャラ、
//    "any_present"=同席者、数値=そのキャラ。「渡す」で相手の持ち物へ移った物は、プレイヤーの
//    持ち物からは消えるので、渡した結果を見たい時はholderにそのキャラを指定する。
//    複数のキャラに解決された場合は、誰か1人でも持っていれば「持っている」。
//  - negate: 「持っていない」を成立条件にする。
function heldBy(playthroughId, ownerCharacterId, params) {
  const rows = db
    .prepare(
      `SELECT i.id, i.name FROM playthrough_inventory pi
       JOIN items i ON i.id = pi.item_id
       WHERE pi.playthrough_id = ? AND pi.owner_character_id IS ? AND pi.quantity > 0`,
    )
    .all(playthroughId, ownerCharacterId);
  return rows.some(
    (row) =>
      (params.item_id == null || row.id === params.item_id) &&
      (!params.item_name_contains || row.name.includes(params.item_name_contains)),
  );
}

export function evaluateHasItem(params, ctx) {
  const hasCriteria = params.item_id != null || Boolean(params.item_name_contains);
  if (!hasCriteria) return false;

  const holders =
    params.holder == null
      ? [null]
      : params.holder === 'any_present'
        ? ctx.participants.map((p) => p.character_id)
        : params.holder === 'mentioned'
          ? resolveMentionedList(ctx.mentionedCharacterIds, params.mentioned_limit)
          : [params.holder];
  const held = holders.some((ownerId) => heldBy(ctx.playthroughId, ownerId, params));
  return params.negate ? !held : held;
}
