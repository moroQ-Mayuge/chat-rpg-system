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
import { evaluateRelationshipProbability } from './relationshipProbability.js';

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
};

// Returns the array of character ids this one condition is about, or null if
// the condition type/params don't name any particular character. Sync only
// (unlike evaluateCondition) -- none of the four matcher-bearing types touch
// the LLM, so per_character_firing's candidate computation never awaits.
export function getMatchingCharacters(condition, ctx) {
  if (condition.params?.negate) return null;
  const matcher = characterMatcherRegistry[condition.condition_type];
  return matcher ? matcher(condition.params, ctx) : null;
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
