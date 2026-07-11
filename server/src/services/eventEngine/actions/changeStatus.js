import { grantStatus, removeStatus, setStatusLocked } from '../../../db/repositories/characterStatusStatesRepo.js';

// { character_id: number|"all_present", status_id, operation: "grant"|"remove"|"lock"|"unlock", locked? }
// "lock" keeps an automatically-clearable status (see axis_status_triggers)
// from being auto-removed once its threshold is no longer met — lets a
// World author require a dedicated event ("目を覚ます" etc.) to end it
// instead of a passive stat recovery doing so silently.
export async function executeChangeStatus(params, execCtx) {
  const { character_id, status_id, operation, locked } = params;
  const targetIds = character_id === 'all_present' ? execCtx.session.participants.map((p) => p.character_id) : [character_id];
  const statusCtx = { playthroughId: execCtx.playthroughId, roomSessionId: execCtx.sessionId };

  const changes = targetIds.map((id) => {
    if (operation === 'grant') return { character_id: id, ...grantStatus(id, status_id, statusCtx, locked ?? false) };
    if (operation === 'remove') return { character_id: id, ...removeStatus(id, status_id, statusCtx) };
    if (operation === 'lock') return { character_id: id, ...setStatusLocked(id, status_id, statusCtx, true) };
    if (operation === 'unlock') return { character_id: id, ...setStatusLocked(id, status_id, statusCtx, false) };
    return { character_id: id, skipped: true };
  });
  return { changes };
}
