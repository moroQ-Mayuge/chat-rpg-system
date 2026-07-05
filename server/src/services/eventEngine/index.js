import { getRoomSession } from '../../db/repositories/roomSessionsRepo.js';
import { listActiveEventDefinitionsForRoomTemplate } from '../../db/repositories/eventDefinitionsRepo.js';
import { countUserTurnsForPlaythrough } from '../../db/repositories/messagesRepo.js';
import { getAllFlags, getFlag } from '../../db/repositories/sessionFlagsRepo.js';
import { getFireCount, getLastFireTurn, recordFire } from '../../db/repositories/eventFireHistoryRepo.js';
import { getOverride } from '../../db/repositories/roomTemplateEventsRepo.js';
import { evaluateCondition } from './conditions/registry.js';
import { executeAction } from './actions/registry.js';

// Deliberate simplification vs. SPEC.md 3.6.1's literal staged before/after-LLM-call
// evaluation: since no action ever actually fires until after the LLM response is
// available anyway (step 5 happens after step 3), all condition types — including
// keyword's user_message/ai_response targets — are evaluated together in one pass
// once both texts are on hand.
function passesCooldownAndMaxFires(def, playthroughId, turnNumber) {
  if (def.max_fires_per_session != null && getFireCount(playthroughId, def.id) >= def.max_fires_per_session) {
    return false;
  }
  if (def.cooldown_turns > 0) {
    const lastFire = getLastFireTurn(playthroughId, def.id);
    if (lastFire != null && turnNumber - lastFire < def.cooldown_turns) return false;
  }
  return true;
}

function resolveExclusiveGroups(eligibleDefs) {
  const seenGroups = new Set();
  const firing = [];
  for (const def of eligibleDefs) {
    if (def.exclusive_group) {
      if (seenGroups.has(def.exclusive_group)) continue;
      seenGroups.add(def.exclusive_group);
    }
    firing.push(def);
  }
  return firing;
}

// Runs every active event definition for the room template this session belongs
// to, fires the ones whose conditions + control gates (cooldown/max_fires/
// exclusive_group) pass, and applies their actions in priority order.
export async function runEventEngine({ sessionId, playthroughId, roomTemplateId, userMessage, aiResponseText }) {
  const session = getRoomSession(sessionId);
  const turnNumber = countUserTurnsForPlaythrough(playthroughId);
  const flags = getAllFlags(playthroughId);
  const defs = listActiveEventDefinitionsForRoomTemplate(roomTemplateId);

  const baseCtx = {
    session,
    playthroughId,
    roomTemplateId,
    turnNumber,
    flags,
    userMessage,
    aiResponseText,
    participants: session.participants,
    flagSetAtTurn: (flagKey) => getFlag(playthroughId, flagKey)?.set_at_turn ?? null,
  };

  const eligible = [];
  for (const def of defs) {
    if (!passesCooldownAndMaxFires(def, playthroughId, turnNumber)) continue;

    const override = getOverride(roomTemplateId, def.id);
    const results = def.conditions.map((condition) =>
      evaluateCondition(condition, {
        ...baseCtx,
        eventDefinitionId: def.id,
        overrideProbability: condition.condition_type === 'probability' ? override?.override_probability : undefined,
      }),
    );
    const passed = def.condition_logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
    if (passed) eligible.push(def);
  }

  const firing = resolveExclusiveGroups(eligible);
  const fired = [];

  for (const def of firing) {
    recordFire(playthroughId, def.id, turnNumber);
    const actionResults = [];
    for (const action of def.actions) {
      // Actions run sequentially and re-fetch session state as needed, so a
      // character_join earlier in this same event is visible to a later
      // change_relationship/generate_image action in the same firing.
      const execCtx = { sessionId, playthroughId, roomTemplateId, session: getRoomSession(sessionId), turnNumber };
      const result = await executeAction(action, execCtx);
      actionResults.push({ actionType: action.action_type, result });
    }
    fired.push({ eventDefinitionId: def.id, name: def.name, actionResults });
  }

  return fired;
}
