import { createPregnancy } from '../../../db/repositories/characterPregnanciesRepo.js';
import { getPlaythrough, syncDerivedCharacterFlags } from '../../../db/repositories/playthroughsRepo.js';
import { getWorld } from '../../../db/repositories/worldsRepo.js';
import { db } from '../../../db/connection.js';
import { cyclePhaseFor } from '../../fertilityCycle.js';
import { resolveMentionedList } from '../mentionResolution.js';

// 受胎判定。周期(0070)の段階を確率に変えるので、危険日に何をしたかがそのまま
// 効いてくる。周期が無効なキャラ・無効なWorldでは NO_CYCLE_CHANCE を使う。
const PHASE_CHANCE = {
  最危険: 0.5,
  危険: 0.35,
  やや危険: 0.2,
  やや安全: 0.08,
  安全: 0.02,
};
const NO_CYCLE_CHANCE = 0.2;

// { character_id: number|"all_present"|"mentioned", mentioned_limit?, chance? }
// chance を明示すると周期を無視してその確率になる(確実に妊娠させる演出用に 1 を
// 指定する、など)。避妊は has_status / has_item といった既存の条件でイベント側が
// 弾く前提で、ここには持ち込まない——道具立ては世界観ごとに違うため。
export async function executeConceive(params, execCtx) {
  const { character_id, mentioned_limit, chance } = params;
  const playthrough = getPlaythrough(execCtx.playthroughId);
  const world = getWorld(playthrough.world_id);
  if (!world.pregnancy_enabled) return { skipped: true, reason: 'pregnancy_disabled' };
  // ナレーター視点のルートには父になる「あなた」が居ない。相手を「あなた」に
  // 限っている以上、この視点では機能ごと成立しない。
  if (playthrough.protagonist_mode === 'narrator') return { skipped: true, reason: 'narrator_mode' };

  const targetIds =
    character_id === 'all_present'
      ? execCtx.session.participants.map((p) => p.character_id)
      : character_id === 'mentioned'
        ? resolveMentionedList(execCtx.mentionedCharacterIds, mentioned_limit)
        : [character_id];

  const multiplier = world.conception_rate_multiplier ?? 1;
  const results = [];
  for (const id of targetIds) {
    const character = db.prepare('SELECT cycle_enabled, cycle_offset_day FROM characters WHERE id = ?').get(id);
    const phase = cyclePhaseFor(character, playthrough, world);
    const base = chance != null ? chance : (PHASE_CHANCE[phase] ?? NO_CYCLE_CHANCE);
    // chance を明示した場合は倍率を掛けない。演出として指定した値が World 設定で
    // 勝手に変わると、作者の意図した「必ず」が「たぶん」になってしまう。
    const effective = chance != null ? base : base * multiplier;
    if (Math.random() >= effective) {
      results.push({ character_id: id, phase, chance: effective, conceived: false });
      continue;
    }
    // モブ・既に妊娠中は createPregnancy 側で弾かれて null が返る。
    const pregnancy = createPregnancy(execCtx.playthroughId, id, playthrough.current_day);
    results.push({ character_id: id, phase, chance: effective, conceived: Boolean(pregnancy) });
  }

  // 受胎したその日のうちに flag_state(pregnancy_stage) を条件にしたイベントが
  // 効くよう、日跨ぎを待たずにフラグを写す。
  if (results.some((r) => r.conceived)) {
    syncDerivedCharacterFlags(execCtx.playthroughId, playthrough.current_day, world);
  }
  return { results };
}
