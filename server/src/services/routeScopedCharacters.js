// ルート固有キャラ(0079_route_scoped_characters.sql)の出現規則。
//
// キャラ候補を characters 全件から選ぶ箇所が4つあり(部屋入室時の属性タグ自動
// 出現、行単位ランダム割当の抽選プール、イベントの tag_match、キャラ一覧の
// World 所属導出)、どれも同じ規則で絞る必要がある。書き写すと必ずどれかが
// 漏れるので、条件はここ1箇所に置く。
//
//   プリセットキャラ(is_auto_created = 0) … 従来どおり全ルートで出る
//   自ルートの子                          … そのルートでだけ出る
//   ルートが消えて浮いた子                … どこにも自動では出ない
//
// 最後の1つが重要。ルート削除で origin_playthrough_id は NULL になるが、
// それを「制約なし」と読むと、自宅用の属性タグを持った子が他人の家に現れる。
// is_auto_created が残っているので「自動出現の対象外」と判定できる。
export function isEligibleInRoute(character, playthroughId) {
  if (!character?.is_auto_created) return true;
  return character.origin_playthrough_id != null && character.origin_playthrough_id === playthroughId;
}

// 上と同じ条件のSQL版。全件走査するクエリの WHERE に足して使う。
// playthroughId は名前付きパラメータ :playthroughId で渡す(NULL可 — その場合
// 自動作成キャラは1件も通らない)。
export const ELIGIBLE_IN_ROUTE_SQL =
  '(is_auto_created = 0 OR (origin_playthrough_id IS NOT NULL AND origin_playthrough_id = :playthroughId))';
