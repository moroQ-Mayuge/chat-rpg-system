// { room_template_ids: number[], negate? }
// 今いる部屋(サブ部屋ではなく部屋そのもの)が、指定した部屋のいずれかか。negate=true なら
// 「指定した部屋のどれでもない」(=これ以外の部屋)で成立。scope=room_template のイベントが
// 1部屋しか指定できないのに対し、複数の部屋・または「この部屋以外すべて」を条件として書ける。
// 部屋の指定が空の時は、negateに関わらず不成立(インポート時に部屋が解決できず空になった
// 場合などに、意図せず「どこでも発火」へ変わってしまわないための安全側の扱い)。
// 生成テキストに依存しない静的な状態なので、事前解決の対象外リストには入れない(既定で事前解決可能)。
export function evaluateInRoom(params, ctx) {
  const ids = Array.isArray(params.room_template_ids) ? params.room_template_ids : [];
  if (ids.length === 0) return false;
  const currentRoomId = ctx.roomTemplateId ?? ctx.session?.room_template_id ?? null;
  const inside = ids.includes(currentRoomId);
  return params.negate ? !inside : inside;
}
