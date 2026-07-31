import { clearTimer } from '../../../db/repositories/playthroughTimersRepo.js';
import { getPlaythrough, syncTimerFlags } from '../../../db/repositories/playthroughsRepo.js';
import { resolveMentionedList } from '../mentionResolution.js';

// { key, character_id?: number|"all_present"|"mentioned", mentioned_limit? }
//
// 予約を取り消す。期日が来たタイマーを「消化した」ことにするのにも使う——
// 消さない限り timer:<key> は due のままで、同じイベントが何度も発火し得る。
export async function executeClearTimer(params, execCtx) {
  const { key, character_id, mentioned_limit } = params;
  if (!key?.trim()) return { skipped: true, reason: 'empty_key' };

  const targetIds =
    character_id == null
      ? [null]
      : character_id === 'all_present'
        ? execCtx.session.participants.map((p) => p.character_id)
        : character_id === 'mentioned'
          ? resolveMentionedList(execCtx.mentionedCharacterIds, mentioned_limit)
          : [character_id];

  const results = targetIds.map((id) => ({ character_id: id, ...clearTimer(execCtx.playthroughId, key.trim(), id) }));
  syncTimerFlags(execCtx.playthroughId, getPlaythrough(execCtx.playthroughId).current_day);
  return { results };
}
