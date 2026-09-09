import { setAccompanying } from '../../../db/repositories/roomSessionsRepo.js';
import { getPlaythrough } from '../../../db/repositories/playthroughsRepo.js';
import { getWorld } from '../../../db/repositories/worldsRepo.js';
import { resolveSingleTargetId } from '../targetResolution.js';

// { character_id: number|"mentioned"|"condition_matched", is_accompanying: boolean }
export async function executeSetAccompanying(params, execCtx) {
  const { character_id, is_accompanying } = params;
  const targetId = resolveSingleTargetId(character_id, execCtx);
  if (targetId == null) return { skipped: true, reason: 'no_target' };

  // モブは「モブのランダムペルソナ」がoffのWorldでは同行できない(見た目だけの
  // 通行人のまま、記憶・関係値も持てないので連れ出す意味が無い)。
  if (is_accompanying) {
    const target = execCtx.session?.participants?.find((p) => p.character_id === targetId);
    if (target?.is_mob) {
      const world = getWorld(getPlaythrough(execCtx.playthroughId).world_id);
      if (world.mob_flavor_mode === 'off') return { skipped: true, reason: 'mob_not_accompaniable' };
    }
  }

  // 同一character_idのモブ重複インスタンスが同席する場合に備え、@メンションが
  // 解決した具体的なroom_session_character_idがあればそれだけを更新する
  // (changeRelationship.jsのinstance_idと同じ取得方法)。
  const roomSessionCharacterId = execCtx.instanceHintByCharacterId?.get(targetId) ?? null;
  setAccompanying(execCtx.sessionId, targetId, Boolean(is_accompanying), roomSessionCharacterId);
  return { character_id: targetId, is_accompanying: Boolean(is_accompanying) };
}
