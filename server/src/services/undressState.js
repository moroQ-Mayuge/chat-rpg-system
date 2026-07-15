import { listActiveStatuses } from '../db/repositories/characterStatusStatesRepo.js';

// "脱衣状態" is the exclusive_group family surfaced to the LLM directly (see
// characterSheetFormat.js's serializeCharacter) — reserved exclusive_group
// names the user assigns to their own character_statuses rows (e.g. 通常/
// 上着なし/下着露出/服なし for upper_clothing) when authoring an undress-state
// ladder. Independent per body-half × 服/下着, so a character can be in any
// combination (服は半脱ぎだが下着はまだ着衣、等) simultaneously. Other
// exclusive_group families (関係 stage, etc.) stay LLM-invisible, same as
// before this feature existed. Shared by promptBuilder.js (per-turn system
// prompt) and insertDialogue.js's generated-mode forced dialogue.
export const UNDRESS_STATE_TRACKS = {
  undress_state_upper_clothing: '上半身の服装',
  undress_state_upper_underwear: '上半身下着',
  undress_state_lower_clothing: '下半身の服装',
  undress_state_lower_underwear: '下半身下着',
};

export function getUndressStateLines(playthroughId, roomSessionId, characterId) {
  const active = listActiveStatuses(characterId, { playthroughId, roomSessionId });
  const lines = [];
  for (const status of active) {
    const label = UNDRESS_STATE_TRACKS[status.exclusive_group];
    if (label) lines.push(`現在の${label}状態：${status.name}`);
  }
  return lines;
}
