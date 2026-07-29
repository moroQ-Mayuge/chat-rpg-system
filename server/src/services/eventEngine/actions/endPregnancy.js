import { getActivePregnancy, endPregnancy, setKnownFrom } from '../../../db/repositories/characterPregnanciesRepo.js';
import { getPlaythrough, syncDerivedCharacterFlags } from '../../../db/repositories/playthroughsRepo.js';
import { getWorld } from '../../../db/repositories/worldsRepo.js';
import { resolveMentionedList } from '../mentionResolution.js';

// { character_id: number|"all_present"|"mentioned", mentioned_limit?,
//   operation?: "end"|"reveal", outcome?: "出産"|"流産"|"中絶",
//   child_name?, child_gender? }
//
// エンジンは臨月を見て勝手に出産させたりしない。作者が flag_state(pregnancy_stage
// == 臨月) を条件にした出産イベントを書き、その結末でこれを呼ぶ——ターン駆動しか
// 無いこの作りに、時間で自動発火する仕組みを1つだけ足すのは筋が悪いため。
//
// operation: "reveal" は本人が妊娠に気づく方（検査・保健室・相手からの指摘）。
// 妊娠そのものは続くので、終了とは別物として同じアクションに寄せてある。
export async function executeEndPregnancy(params, execCtx) {
  const { character_id, mentioned_limit, operation = 'end', outcome = '出産', child_name, child_gender } = params;
  const playthrough = getPlaythrough(execCtx.playthroughId);
  const world = getWorld(playthrough.world_id);
  if (!world.pregnancy_enabled) return { skipped: true, reason: 'pregnancy_disabled' };

  const targetIds =
    character_id === 'all_present'
      ? execCtx.session.participants.map((p) => p.character_id)
      : character_id === 'mentioned'
        ? resolveMentionedList(execCtx.mentionedCharacterIds, mentioned_limit)
        : [character_id];

  const changes = [];
  for (const id of targetIds) {
    const pregnancy = getActivePregnancy(execCtx.playthroughId, id);
    if (!pregnancy) continue; // 妊娠していない相手に撃たれても素通り
    if (operation === 'reveal') {
      const revealed = setKnownFrom(pregnancy.id, playthrough.current_day);
      changes.push({ character_id: id, operation, known_from_day: revealed.known_from_day });
      continue;
    }
    const ended = endPregnancy(pregnancy.id, playthrough.current_day, outcome, {
      childName: child_name ?? '',
      childGender: child_gender ?? '',
    });
    changes.push({ character_id: id, operation, outcome: ended.outcome, ended_day: ended.ended_day });
  }

  // 終了で pregnancy_stage を消す/周期を戻すのも、発覚で段階が変わらないのも、
  // どちらも次の日跨ぎを待たずに反映されてほしい。
  if (changes.length > 0) syncDerivedCharacterFlags(execCtx.playthroughId, playthrough.current_day, world);
  return { changes };
}
