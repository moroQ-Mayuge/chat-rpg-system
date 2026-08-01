import { advanceTime, getPlaythrough, recordTimeSkip } from '../../../db/repositories/playthroughsRepo.js';
import { getWorld } from '../../../db/repositories/worldsRepo.js';
import { applyTimeSkipEffects, formatSkipLabel } from '../../timeSkip.js';

// { days, summarize?: boolean }
//
// advance_time の大きい版。時間帯ではなく日数で指定し、跳んだあとに
// 加齢と期間の要約を行う(timeSkip.js)。
//
// 日数の加算そのものは advanceTime に委ねている。天候の振り直し・季節の再計算・
// 曜日・周期や妊娠の段階・タイマーの期日は、あちらが日跨ぎのたびに面倒を見る。
// ここで自前に計算し直すと、その全部を二重に持つことになる。
export async function executeTimeSkip(params, execCtx) {
  const { days, summarize = true } = params;
  const dayCount = Math.floor(Number(days));
  if (!Number.isFinite(dayCount) || dayCount <= 0) return { skipped: true, reason: 'invalid_days' };

  const before = getPlaythrough(execCtx.playthroughId);
  const world = getWorld(before.world_id);
  const label = formatSkipLabel(world, dayCount);

  // 1日 = 時間帯の数。同じ時間帯のまま日付だけが進む。
  advanceTime(execCtx.playthroughId, dayCount * world.time_slot_labels.length);

  const effects = await applyTimeSkipEffects(execCtx.playthroughId, world, dayCount, label, { summarize });

  const after = getPlaythrough(execCtx.playthroughId);
  // World設定「子の登場」= on_time_skip の判定材料。跳躍の大小を問わないので、
  // ここで実行された事実だけを記録する(pregnancy.js 参照)。
  recordTimeSkip(execCtx.playthroughId, after.current_day);
  return {
    label,
    from_day: before.current_day,
    to_day: after.current_day,
    ...effects,
  };
}
