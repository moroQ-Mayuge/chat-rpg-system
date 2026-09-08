import { setAccompanying } from '../../../db/repositories/roomSessionsRepo.js';
import { resolveSingleTargetId } from '../targetResolution.js';

// { character_id: number|"mentioned"|"condition_matched", is_accompanying: boolean }
export async function executeSetAccompanying(params, execCtx) {
  const { character_id, is_accompanying } = params;
  const targetId = resolveSingleTargetId(character_id, execCtx);
  if (targetId == null) return { skipped: true, reason: 'no_target' };
  // 同一character_idのモブ重複インスタンスが同席する場合に備え、@メンションが
  // 解決した具体的なroom_session_character_idがあればそれだけを更新する
  // (changeRelationship.jsのinstance_idと同じ取得方法)。
  const roomSessionCharacterId = execCtx.instanceHintByCharacterId?.get(targetId) ?? null;
  setAccompanying(execCtx.sessionId, targetId, Boolean(is_accompanying), roomSessionCharacterId);
  return { character_id: targetId, is_accompanying: Boolean(is_accompanying) };
}
