import { evaluateProbability } from './probability.js';
import { evaluateTurnCount } from './turnCount.js';
import { evaluateKeyword } from './keyword.js';
import { evaluateRelationshipThreshold } from './relationshipThreshold.js';
import { evaluateFlagState } from './flagState.js';
import { evaluateParticipantCount } from './participantCount.js';
import { evaluateHasItem } from './hasItem.js';
import { evaluateLlmJudge } from './llmJudge.js';
import { evaluateHasStatus } from './hasStatus.js';
import { evaluateHasOutfit } from './hasOutfit.js';
import { evaluateHasMoney } from './hasMoney.js';

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
};

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
