import { grantStatus, removeStatus, setStatusLocked } from '../../../db/repositories/characterStatusStatesRepo.js';
import { resolveTargetIds } from '../targetResolution.js';

// { character_id: number|"all_present"|"mentioned"|"condition_matched", status_id, operation: "grant"|"remove"|"lock"|"unlock", locked?, mentioned_limit? }
// "lock" keeps an automatically-clearable status (see axis_status_triggers)
// from being auto-removed once its threshold is no longer met — lets a
// World author require a dedicated event ("目を覚ます" etc.) to end it
// instead of a passive stat recovery doing so silently.
export async function executeChangeStatus(params, execCtx) {
  const { character_id, status_id, operation, locked, mentioned_limit } = params;
  // See changeRelationship.js's identical comment -- {character_id, instance_id}
  // pairs so duplicate mob instances each get their own status set.
  const targets =
    character_id === 'all_present'
      ? execCtx.session.participants.map((p) => ({ character_id: p.character_id, instance_id: p.id }))
      : resolveTargetIds(character_id, mentioned_limit, execCtx).map((id) => ({
          character_id: id,
          instance_id: execCtx.instanceHintByCharacterId?.get(id),
        }));

  // status_id/operationをそのまま乗せておく(0125): 自動画像生成フック
  // (autoOutfitImage.js)がfired[].actionResultsから「今回どのstatusが
  // 付与/解除されたか」を判定するのに必要——grantStatus/removeStatusの
  // 戻り値自体にはstatus_idが含まれないため。
  const changes = targets.map(({ character_id: id, instance_id }) => {
    const statusCtx = { playthroughId: execCtx.playthroughId, roomSessionId: execCtx.sessionId, roomSessionCharacterId: instance_id };
    if (operation === 'grant') return { character_id: id, status_id, operation, ...grantStatus(id, status_id, statusCtx, locked ?? false) };
    if (operation === 'remove') return { character_id: id, status_id, operation, ...removeStatus(id, status_id, statusCtx) };
    if (operation === 'lock') return { character_id: id, status_id, operation, ...setStatusLocked(id, status_id, statusCtx, true) };
    if (operation === 'unlock') return { character_id: id, status_id, operation, ...setStatusLocked(id, status_id, statusCtx, false) };
    return { character_id: id, status_id, operation, skipped: true };
  });
  return { changes };
}
