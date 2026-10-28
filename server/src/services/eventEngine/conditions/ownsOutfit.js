import { db } from '../../../db/connection.js';
import { resolveMentionedList } from '../mentionResolution.js';

// { outfit_master_id?, name_contains?, holder?, mentioned_limit?, negate? }
// 衣装マスタを「所持しているか」(has_outfit は今着ている衣装を見る別の条件)。holder は has_item と同じ
// (省略=プレイヤー、"mentioned"/"any_present"/キャラid=そのキャラの持ち物)。マスタは outfit_master_id の
// 完全一致か name_contains の部分一致で指定する(どちらも無ければ不成立)。
export function evaluateOwnsOutfit(params, ctx) {
  if (params.outfit_master_id == null && !params.name_contains) return false;
  const holders =
    params.holder == null
      ? [null]
      : params.holder === 'any_present'
        ? ctx.participants.map((p) => p.character_id)
        : params.holder === 'mentioned'
          ? resolveMentionedList(ctx.mentionedCharacterIds, params.mentioned_limit)
          : [params.holder];
  const owned = holders.some((ownerId) =>
    db
      .prepare(
        `SELECT om.id, om.name FROM playthrough_outfit_inventory poi
         JOIN outfit_masters om ON om.id = poi.outfit_master_id
         WHERE poi.playthrough_id = ? AND poi.owner_character_id IS ? AND poi.quantity > 0`,
      )
      .all(ctx.playthroughId, ownerId)
      .some(
        (row) =>
          (params.outfit_master_id == null || row.id === params.outfit_master_id) &&
          (!params.name_contains || row.name.includes(params.name_contains)),
      ),
  );
  return params.negate ? !owned : owned;
}
