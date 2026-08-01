import { setTimer } from '../../../db/repositories/playthroughTimersRepo.js';
import { getPlaythrough, syncTimerFlags } from '../../../db/repositories/playthroughsRepo.js';
import { resolveTargetIds } from '../targetResolution.js';

// { key, days, character_id?: number|"all_present"|"mentioned"|"condition_matched", mentioned_limit?, note? }
//
// 「n日後に成立する予約」を張る。期日が来たかは flag_state で timer:<key> を
// pending / due として読む——専用の条件タイプは足していない。
//
// 揺り籠(出産から一定日数で子が戻る)はこれの一用途にすぎず、手紙が届く・注文品の
// 入荷・怪我の治癒・約束の日も同じ形で書ける。
//
// character_id を省くとルート全体のタイマー(セッションフラグ)になる。指定すると
// キャラごとに1本ずつ張られ、キャラフラグに入る。
export async function executeSetTimer(params, execCtx) {
  const { key, days, character_id, mentioned_limit, note } = params;
  if (!key?.trim()) return { skipped: true, reason: 'empty_key' };
  const dayCount = Number(days);
  if (!Number.isFinite(dayCount) || dayCount < 0) return { skipped: true, reason: 'invalid_days' };

  const playthrough = getPlaythrough(execCtx.playthroughId);
  const startDay = playthrough.current_day;
  const dueDay = startDay + Math.floor(dayCount);

  const targetIds = character_id == null ? [null] : resolveTargetIds(character_id, mentioned_limit, execCtx);

  const timers = targetIds.map((id) =>
    setTimer(execCtx.playthroughId, key.trim(), { characterId: id, startDay, dueDay, note: note ?? '' }),
  );

  // 張った直後にフラグへ写す。日跨ぎを待つと、0日指定(その場で due)のタイマーが
  // 同じターンの後続イベントから見えない。
  syncTimerFlags(execCtx.playthroughId, startDay);
  return { timers: timers.map((t) => ({ character_id: t.character_id, key: t.timer_key, due_day: t.due_day })) };
}
