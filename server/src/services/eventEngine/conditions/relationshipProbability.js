import { getValue, getAxis } from '../../../db/repositories/relationshipStatesRepo.js';
import { resolveSingleTargetId } from '../targetResolution.js';

// preResolution.js(2026-09-11)がヒントの宛先キャラを決めるための対になる
// マッチャー。ロールは一切せず対象idを解決するだけ——evaluateRelationshipProbability
// と同じ対象解決ロジックだが確率判定は行わない。per_character_firingの候補
// narrowingにも同じ仕組みで使われる(registry.jsのcharacterMatcherRegistry)。
export function matchingCharactersForRelationshipProbability(params, ctx) {
  const { character_id } = params;
  const targetId = character_id === 'any_present' ? (ctx.participants?.[0]?.character_id ?? null) : resolveSingleTargetId(character_id, ctx);
  return targetId != null ? [targetId] : [];
}

// { character_id: number|"mentioned"|"any_present"|"condition_matched", axis_ids: number[] }
// 対象キャラのaxis_idsのうち、正規化値((現在値-min_value)/(max_value-min_value))が
// 最大の軸を確率として採用する(例: 信頼度/恋愛度/依存度のどれか高い方で成立)。
export function evaluateRelationshipProbability(params, ctx) {
  const { character_id, axis_ids } = params;
  const targetId = character_id === 'any_present' ? (ctx.participants?.[0]?.character_id ?? null) : resolveSingleTargetId(character_id, ctx);
  if (targetId == null || !axis_ids?.length) return false;

  const chance = Math.max(
    ...axis_ids.map((axisId) => {
      const axis = getAxis(axisId);
      const range = axis.max_value - axis.min_value;
      const value = getValue(ctx.playthroughId, targetId, axisId, ctx.session.id);
      return range > 0 ? (value - axis.min_value) / range : 0;
    }),
  );
  return Math.random() < chance;
}
