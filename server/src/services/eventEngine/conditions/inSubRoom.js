// { sub_room_id: number|null } — サブ部屋(0150、Stage 6)。現在のプレイヤー位置
// (ctx.session.sub_room_id)が指定したサブ部屋と一致するか。sub_room_id未指定
// (null)は「親部屋本体(サブ部屋の外)にいる」を表す——room_sessions.sub_room_id
// と同じNULL=メインの規約。生成テキストに一切依存しない静的な状態(LLMの
// ストリーミング中に書き換わるタグの影響を受けない)なので、事前解決
// (preResolutionEligibility.js)の対象外リストに入れる必要はない——既定で
// 事前解決可能。
//
// 拡張: { sub_room_ids: (number|null)[], negate? }。リストのどれかにいるか
// (null=親部屋本体)を判定し、negate なら「それら以外にいる時」。リストが空の時は
// negate に関わらず不成立(インポートでサブ部屋が解決できず空になった時に、意図せず
// どこでも成立してしまうのを防ぐ。in_room と同じ)。従来の sub_room_id だけの指定は、
// negate も含めてそのまま使える。
export function evaluateInSubRoom(params, ctx) {
  const current = ctx.session?.sub_room_id ?? null;
  let ids;
  if (Array.isArray(params.sub_room_ids)) {
    if (params.sub_room_ids.length === 0) return false;
    ids = params.sub_room_ids.map((id) => id ?? null);
  } else {
    ids = [params.sub_room_id ?? null];
  }
  const inside = ids.includes(current);
  return params.negate ? !inside : inside;
}
