// Shared "which characters does this action's character_id param mean"
// resolution, used by every multi/single-target action (conceive,
// end_pregnancy, set_flag, change_relationship, insert_dialogue, ...).
// Previously each action file duplicated its own all_present/mentioned
// ternary; condition_matched needed one place to land rather than a dozen.
import { resolveMentionedList, resolveMentionedSingle } from './mentionResolution.js';
import { characterBelongsToWorld, resolveWorldIdForPlaythrough } from './characterWorldMembership.js';

// event_definitions.restrict_to_own_world(0144)向けのフィルタ。'all_present'
// (execCtx.session.participants由来)は対象外——このWorldのセッションに既に
// 実在する参加者なので、改めて所属確認する意味が無い。他の解決結果(固定id・
// "mentioned"・"condition_matched")だけをこのWorldの所属者に絞り込む。
function filterToOwnWorld(ids, execCtx) {
  if (!execCtx.restrictToOwnWorld || ids.length === 0) return ids;
  const worldId = resolveWorldIdForPlaythrough(execCtx.playthroughId);
  if (worldId == null) return ids;
  return ids.filter((id) => characterBelongsToWorld(id, worldId));
}

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
  if (character_id === 'mentioned') return filterToOwnWorld(resolveMentionedList(execCtx.mentionedCharacterIds, mentioned_limit), execCtx);
  if (character_id === 'condition_matched') return filterToOwnWorld(execCtx.matchedCharacterIds ?? [], execCtx);
  return character_id == null ? [] : filterToOwnWorld([character_id], execCtx);
}

// Same sentinels, for actions that only ever act on one character (their
// select offers "mentioned"/a fixed id but never "all_present"). Takes the
// first id when a multi-id sentinel resolves to more than one.
export function resolveSingleTargetId(character_id, execCtx) {
  let raw;
  if (character_id === 'mentioned') raw = resolveMentionedSingle(execCtx.mentionedCharacterIds);
  else if (character_id === 'condition_matched') raw = execCtx.matchedCharacterIds?.[0] ?? null;
  else raw = character_id ?? null;
  if (raw == null) return null;
  return filterToOwnWorld([raw], execCtx)[0] ?? null;
}
