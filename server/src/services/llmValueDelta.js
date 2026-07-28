// LLMが返した値の増減を、Worldの上限(worlds.llm_value_delta_cap)に収める。
//
// 関係値の定期更新(relationshipAutoUpdate.js)と状態値のSTAT_CHANGEタグ
// (routes/roomSessions.js)の2箇所で使う。呼び出し側がサービス層とルート層に
// 分かれているのでここに置いてある。
//
// adjustValue の中でクランプしないのは、イベントアクションも同じ関数を通るため。
// 作者が「このイベントで好感度+50」と明示的に書いた変更まで削ってしまうと、
// イベントで大きく動かすという設計意図が壊れる。効かせるのはLLMの自由出力だけ。
export function clampLlmDelta(delta, cap) {
  if (!Number.isFinite(delta)) return delta;
  // 0以下は「上限なし」と同義に倒す。UIは空欄=NULLだが、0が入ってきたときに
  // 全ての変動が0になる(=自動更新が黙って死ぬ)より、無制限側に倒す方が安全。
  if (!Number.isFinite(cap) || cap <= 0) return delta;
  return Math.max(-cap, Math.min(cap, delta));
}
