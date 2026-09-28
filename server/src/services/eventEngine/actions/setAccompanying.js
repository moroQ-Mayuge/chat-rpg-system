import { setAccompanying } from '../../../db/repositories/roomSessionsRepo.js';
import { getPlaythrough } from '../../../db/repositories/playthroughsRepo.js';
import { getWorld } from '../../../db/repositories/worldsRepo.js';
import { resolveSingleTargetId } from '../targetResolution.js';

// { character_id: number|"mentioned"|"condition_matched"|"all_accompanying", is_accompanying: boolean,
//   mode?: "date"|"undate" }
// mode(デート中、0152): 省略時は従来どおりの同行(既にデート中のキャラは格下げしない)。
// "date"+is_accompanying:true → デート中にする(同行も含意)。"undate"+is_accompanying:true →
// デート中のキャラだけを同行へ格下げする(=「デートをやめて」。デート中でないキャラには何もしない
// ——同行していないキャラを格下げのついでに同行させてしまわないため)。is_accompanying:false は
// modeによらず同行・デートの両方を解除する。
export async function executeSetAccompanying(params, execCtx) {
  const { character_id, is_accompanying, mode } = params;
  const datingOption = mode === 'date' ? { dating: true } : mode === 'undate' ? { dating: false } : {};

  // 「解散」コマンド用: 現在同行中の全員を一括で対象にする。他のsentinel
  // (mentioned等)と違いtargetResolution.jsを経由しない——同行中かどうかは
  // このセッションの現在状態そのものなので、resolveSingleTargetIdの
  // 単一ターゲット解決とは性質が異なる。
  if (character_id === 'all_accompanying') {
    // 解散は、サブ部屋で待機中(別所)の同行者も含めて全員(0150)。
    const targets = (execCtx.session.active_participants ?? execCtx.session.participants).filter((p) => p.is_accompanying);
    if (targets.length === 0) return { skipped: true, reason: 'no_accompanying' };
    for (const p of targets) {
      setAccompanying(execCtx.sessionId, p.character_id, Boolean(is_accompanying), p.id, datingOption);
    }
    return { character_ids: targets.map((p) => p.character_id), is_accompanying: Boolean(is_accompanying) };
  }

  const targetId = resolveSingleTargetId(character_id, execCtx);
  if (targetId == null) return { skipped: true, reason: 'no_target' };

  if (mode === 'undate') {
    const target = execCtx.session?.participants?.find((p) => p.character_id === targetId);
    if (!target?.is_dating) return { skipped: true, reason: 'not_dating' };
  }

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
  setAccompanying(execCtx.sessionId, targetId, Boolean(is_accompanying), roomSessionCharacterId, datingOption);
  return { character_id: targetId, is_accompanying: Boolean(is_accompanying), mode: mode ?? null };
}
