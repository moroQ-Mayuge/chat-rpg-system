// PLAN_2026-08-02_outfit_spec_revision.md §4.3/§6 実装順1: resolveOutfitTags()
// の呼び出し元全員がここを経由するようにする継ぎ目。今は outfit をそのまま
// 返すだけの恒等関数(挙動不変)。将来の段(キャラ素体タグのマージ、衣装マスタ
// 参照解決、下着上書き)はこの関数の中身(将来的にはシグネチャも
// composeWornOutfit(character, outfitInstance, underwearState) へ拡張)だけを
// 変えればよく、下記の呼び出し元を再び洗い出す必要がない。
//
// outfit が null/undefined でもそのまま返す — generateImage.js の一部呼び出し
// 元は current_outfit_id が無い参加者を渡すことがあり、その場合は
// resolveOutfitTags 自身の null 早期returnに委ねる。
export function composeWornOutfit(outfit) {
  return outfit;
}
