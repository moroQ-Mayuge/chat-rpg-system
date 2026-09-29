// { sub_room_id: number|null } — サブ部屋(0150、Stage 6)。現在のプレイヤー位置
// (ctx.session.sub_room_id)が指定したサブ部屋と一致するか。sub_room_id未指定
// (null)は「親部屋本体(サブ部屋の外)にいる」を表す——room_sessions.sub_room_id
// と同じNULL=メインの規約。生成テキストに一切依存しない静的な状態(LLMの
// ストリーミング中に書き換わるタグの影響を受けない)なので、事前解決
// (preResolutionEligibility.js)の対象外リストに入れる必要はない——既定で
// 事前解決可能。
export function evaluateInSubRoom(params, ctx) {
  return (ctx.session?.sub_room_id ?? null) === (params.sub_room_id ?? null);
}
