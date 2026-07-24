import { listActiveStatuses } from '../db/repositories/characterStatusStatesRepo.js';

// "脱衣状態" is the exclusive_group family surfaced to the LLM directly (see
// characterSheetFormat.js's serializeCharacter) — reserved exclusive_group
// names the user assigns to their own character_statuses rows (e.g. 通常/
// 開ける/たくし上げる/破る/脱がす for upper_outer) when authoring an
// undress-state ladder. Independent per body-half × アウター/ベース/下着 (6
// tracks total, L3.4 -- outer and base were one merged "clothing" track
// before this split, so a character can now be in any combination, e.g.
// アウターは脱がしたがベースはまだ通常、等), so a character can be in any
// combination simultaneously. Other exclusive_group families (関係 stage,
// etc.) stay LLM-invisible, same as before this feature existed. Shared by
// promptBuilder.js (per-turn system prompt) and insertDialogue.js's
// generated-mode forced dialogue.
export const UNDRESS_STATE_TRACKS = {
  undress_state_upper_outer: '上半身上着',
  undress_state_upper_base: '上半身中衣',
  undress_state_upper_underwear: '上半身下着',
  undress_state_lower_outer: '下半身上着',
  undress_state_lower_base: '下半身中衣',
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
