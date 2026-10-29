import { evaluateProbability } from './probability.js';
import { evaluateTurnCount } from './turnCount.js';
import { evaluateKeyword } from './keyword.js';
import { evaluateRelationshipThreshold, matchingCharactersForRelationshipThreshold } from './relationshipThreshold.js';
import { evaluateFlagState, matchingCharactersForFlagState } from './flagState.js';
import { evaluateParticipantCount } from './participantCount.js';
import { evaluateHasItem } from './hasItem.js';
import { evaluateLlmJudge } from './llmJudge.js';
import { evaluateHasStatus, matchingCharactersForHasStatus } from './hasStatus.js';
import { evaluateHasOutfit, matchingCharactersForHasOutfit } from './hasOutfit.js';
import { evaluateHasMoney } from './hasMoney.js';
import { evaluateHasPose, matchingCharactersForHasPose } from './hasPose.js';
import { evaluateRelationshipProbability, matchingCharactersForRelationshipProbability } from './relationshipProbability.js';
import { evaluateInSubRoom } from './inSubRoom.js';
import { evaluateCharacterAge } from './characterAge.js';
import { evaluateCompanionState, matchingCharactersForCompanionState } from './companionState.js';
import { evaluateCharacterAttribute, matchingCharactersForCharacterAttribute } from './characterAttribute.js';
import { evaluateCharacterPresent } from './characterPresent.js';
import { evaluateOwnsOutfit } from './ownsOutfit.js';
import { evaluateInRoom } from './inRoom.js';
import { resolveMentionedList } from '../mentionResolution.js';

export const conditionRegistry = {
  probability: evaluateProbability,
  turn_count: evaluateTurnCount,
  keyword: evaluateKeyword,
  relationship_threshold: evaluateRelationshipThreshold,
  flag_state: evaluateFlagState,
  participant_count: evaluateParticipantCount,
  has_item: evaluateHasItem,
  llm_judge: evaluateLlmJudge,
  has_status: evaluateHasStatus,
  has_outfit: evaluateHasOutfit,
  has_money: evaluateHasMoney,
  has_pose: evaluateHasPose,
  relationship_probability: evaluateRelationshipProbability,
  in_sub_room: evaluateInSubRoom,
  character_age: evaluateCharacterAge,
  companion_state: evaluateCompanionState,
  character_attribute: evaluateCharacterAttribute,
  character_present: evaluateCharacterPresent,
  owns_outfit: evaluateOwnsOutfit,
  in_room: evaluateInRoom,
};

// Only condition types that can name a specific character contribute to
// per_character_firing's candidate-narrowing (eventEngine/index.js). Types
// like probability/keyword/llm_judge/participant_count/has_item/has_money
// have no notion of "which character" -- they're absent from this map, and
// getMatchingCharacters returns null for them, same as flag_state's own
// null when its character_id is unset. negate-bearing conditions
// (has_status/has_outfit) are only usable here when NOT negated -- "not
// wearing X" describes an absence, not a specific character, so
// per_character_firing skips negated conditions entirely (see index.js).
const characterMatcherRegistry = {
  flag_state: matchingCharactersForFlagState,
  has_status: matchingCharactersForHasStatus,
  has_outfit: matchingCharactersForHasOutfit,
  has_pose: matchingCharactersForHasPose,
  relationship_threshold: matchingCharactersForRelationshipThreshold,
  relationship_probability: matchingCharactersForRelationshipProbability,
  companion_state: matchingCharactersForCompanionState,
  character_attribute: matchingCharactersForCharacterAttribute,
};

// 否定(negate)条件が対象にするキャラの候補集合(character_idの解決結果)。character_idが
// 数値/"any_present"/"mentioned"以外(未指定等)の時は null(候補を決められない)。
function resolveCandidateIds(params, ctx) {
  const { character_id } = params;
  if (character_id === 'any_present') return (ctx.participants ?? []).map((p) => p.character_id);
  if (character_id === 'mentioned') return resolveMentionedList(ctx.mentionedCharacterIds, params.mentioned_limit);
  return typeof character_id === 'number' ? [character_id] : null;
}

// Returns the array of character ids this one condition is about, or null if
// the condition type/params don't name any particular character. Sync only
// (unlike evaluateCondition) -- none of the matcher-bearing types touch
// the LLM, so per_character_firing's candidate computation never awaits.
//
// negate付きの条件(has_status/has_outfit等)は、「対象(同席者/@メンション/指定キャラ)の
// うち、その条件を満たさないキャラ」を返す(例: 「この状態を持っていないキャラ」ごとに発火)。
// 対象を決められない時(character_id未指定等)は null。
export function getMatchingCharacters(condition, ctx) {
  const matcher = characterMatcherRegistry[condition.condition_type];
  if (!matcher) return null;
  if (!condition.params?.negate) return matcher(condition.params, ctx);
  const candidates = resolveCandidateIds(condition.params, ctx);
  if (candidates === null) return null;
  const matched = new Set(matcher({ ...condition.params, negate: false }, ctx) ?? []);
  return candidates.filter((id) => !matched.has(id));
}

// Awaited unconditionally — most evaluators are sync and resolve
// immediately, but llm_judge needs an actual KoboldCpp round-trip.
export async function evaluateCondition(condition, ctx) {
  const evaluator = conditionRegistry[condition.condition_type];
  if (!evaluator) {
    console.warn(`Unknown event condition_type: ${condition.condition_type}`);
    return false;
  }
  return evaluator(condition.params, ctx);
}
