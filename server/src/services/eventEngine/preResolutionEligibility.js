// preResolution.js(2026-09-11)が「LLM生成前に安全に判定できる」と構造的に
// 断定できるイベント定義だけを選り分けるための純粋な判定関数。DB access無し
// ——`def`はeventDefinitionsRepo.jsが既に組み立て済みの、conditions/actions/
// outcome_nodesが乗った完全なオブジェクトを渡す前提。
//
// 除外条件(いずれか1つでも含む場合、トリガー/outcome・ネスト深さ問わず対象外):
//   - llm_judge: 生成テキストへの依存が本質的(条件自体が別途LLM往復で判定する)。
//   - target!=='user_message'なkeyword: 既定値'any'を含め、ai_response側の
//     テキストも見に行く可能性があるため(keyword.js参照)。
//   - has_pose/has_item/has_money/owns_outfit: LLM応答のストリーミング中に処理される
//     [POSE:xxx]・ショップ部屋の[ITEM_GRANT]/[OUTFIT_GRANT]・[CRAFT_RESULT]
//     タグ(roomSessions.jsのhandleParsedLine)がこれらの状態を書き換えるため、
//     生成前に確定させた結果が生成後の実際の状態とずれる可能性がある。
//
// 上記以外(probability/turn_count/relationship_threshold/flag_state/
// participant_count/has_status/has_outfit/relationship_probability)は
// 生成前の状態だけで安全に確定できる。
const AIRESPONSE_DEPENDENT_TYPES = new Set(['llm_judge', 'has_pose', 'has_item', 'has_money', 'owns_outfit']);

// has_money だけは、所持金が生成中に書き換わりうる経路(ショップ部屋の[ITEM_GRANT]・
// [OUTFIT_GRANT])が無い部屋では、生成前の値がそのまま生成後も正しい——その部屋
// (買い物できない部屋)に限って事前解決を許す(options.moneyStable)。賭け事のように
// 「所持金の確認」と「結果の事前確定(台詞との一致)」を両立したいイベント向け。
function isConditionPreResolvable(condition, options) {
  if (condition.condition_type === 'has_money' && options.moneyStable) return true;
  if (AIRESPONSE_DEPENDENT_TYPES.has(condition.condition_type)) return false;
  if (condition.condition_type === 'keyword' && (condition.params?.target ?? 'any') !== 'user_message') return false;
  return true;
}

export function isPreResolvable(def, options = {}) {
  return (def.conditions ?? []).every((c) => isConditionPreResolvable(c, options));
}
