import { isMobCharacter } from '../../../db/repositories/charactersRepo.js';
import { getWorld } from '../../../db/repositories/worldsRepo.js';
import { getPlaythrough } from '../../../db/repositories/playthroughsRepo.js';
import { setCharacterFlag } from '../../../db/repositories/characterFlagsRepo.js';
import { resolveSingleTargetId } from '../targetResolution.js';
import { promoteMobToFavorite } from '../../mobPromotion.js';

// { character_id: number|"mentioned"|"condition_matched", allow_without_preset?: boolean,
//   grant_flag_key?: string, grant_flag_value?: string, grant_flag_scope?: "playthrough"|"session" }
//
// 薄いラッパー——実体化そのものは既存のpromoteMobToFavorite()(同行キャラの
// 自動昇格が使っているのと同じ関数)に委ねる。対象が既に(is_mob=falseの)
// 実キャラなら何もせずそのIDをそのまま使う(二重昇格の心配が要らない)。
//
// grant_flag_*をこのアクション自身に持たせているのは、"mentioned"/
// "condition_matched"はイベント発火1回の間ずっと固定のスナップショット
// (eventEngine/index.jsのbuildExecCtxが使い回す)で、昇格によって参加者の
// character_idが差し替わった後もそれを追いかけて更新されないため——別アクション
// (set_flag)に分けると、そちらは昇格前の(間もなく共有テンプレートに戻る)古い
// IDにフラグを書いてしまう。1アクション内で完結させることでこれを防ぐ。
export async function executePromoteMobToFavorite(params, execCtx) {
  const { character_id, allow_without_preset = true, grant_flag_key, grant_flag_value, grant_flag_scope = 'playthrough' } = params;
  const targetId = resolveSingleTargetId(character_id, execCtx);
  if (targetId == null) return { skipped: true, reason: 'no_mention' };

  let finalCharacterId = targetId;
  if (isMobCharacter(targetId)) {
    const world = getWorld(getPlaythrough(execCtx.playthroughId).world_id);
    // モブの永続化システム自体をオフにしているWorldでは、どの発生源から
    // 呼ばれても昇格させない(promoteAccompanyingFlavoredMobsと同じ方針)。
    if (world.mob_flavor_mode === 'off') return { skipped: true, reason: 'mob_flavor_off' };

    const participant = execCtx.session.participants.find((p) => p.character_id === targetId);
    if (!participant) return { skipped: true, reason: 'not_present' };

    const result = promoteMobToFavorite(execCtx.sessionId, participant.id, { allowWithoutPreset: allow_without_preset });
    if (!result.character) return { skipped: true, reason: result.error };
    finalCharacterId = result.character.id;
  }

  if (grant_flag_key) {
    setCharacterFlag(
      finalCharacterId,
      grant_flag_key,
      grant_flag_scope,
      { playthroughId: execCtx.playthroughId, roomSessionId: execCtx.sessionId },
      grant_flag_value ?? '1',
      execCtx.turnNumber,
    );
  }

  return { characterId: finalCharacterId, promoted: finalCharacterId !== targetId };
}
