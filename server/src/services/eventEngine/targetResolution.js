// Shared "which characters does this action's character_id param mean"
// resolution, used by every multi/single-target action (conceive,
// end_pregnancy, set_flag, change_relationship, insert_dialogue, ...).
// Previously each action file duplicated its own all_present/mentioned
// ternary; condition_matched needed one place to land rather than a dozen.
import { resolveMentionedList, resolveMentionedSingle } from './mentionResolution.js';

// character_id: number | "all_present" | "mentioned" | "condition_matched" | null
//
// "condition_matched" only means something for a per_character_firing event
// (see 0086_per_character_event_firing.sql / eventEngine/index.js): it
// resolves to the one candidate character whose matching condition(s) this
// particular firing is about, via execCtx.matchedCharacterIds. Used on an
// ordinary event (matchedCharacterIds null) it resolves to no one at all --
// deliberately, rather than falling back to all_present, since silently
// widening the target on a misconfigured action is exactly the mistake this
// option exists to prevent.
export function resolveTargetIds(character_id, mentioned_limit, execCtx) {
  if (character_id === 'all_present') return execCtx.session.participants.map((p) => p.character_id);
  if (character_id === 'mentioned') return resolveMentionedList(execCtx.mentionedCharacterIds, mentioned_limit);
  if (character_id === 'condition_matched') return execCtx.matchedCharacterIds ?? [];
  return character_id == null ? [] : [character_id];
}

// Same sentinels, for actions that only ever act on one character (their
// select offers "mentioned"/a fixed id but never "all_present"). Takes the
// first id when a multi-id sentinel resolves to more than one.
export function resolveSingleTargetId(character_id, execCtx) {
  if (character_id === 'mentioned') return resolveMentionedSingle(execCtx.mentionedCharacterIds);
  if (character_id === 'condition_matched') return execCtx.matchedCharacterIds?.[0] ?? null;
  return character_id ?? null;
}
