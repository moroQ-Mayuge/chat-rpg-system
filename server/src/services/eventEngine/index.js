import { getRoomSession } from '../../db/repositories/roomSessionsRepo.js';
import { listActiveEventDefinitionsForRoomTemplate } from '../../db/repositories/eventDefinitionsRepo.js';
import { countUserTurnsForPlaythrough } from '../../db/repositories/messagesRepo.js';
import { getAllFlags, getFlag } from '../../db/repositories/sessionFlagsRepo.js';
import { getFireCount, getLastFireTurn, recordFire, hasFiredWithOutcome } from '../../db/repositories/eventFireHistoryRepo.js';
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

// Event chaining (chat enhancement backlog item 6): if this event names a
// prerequisite, it isn't eligible until that prerequisite has fired in this
// same playthrough — optionally requiring a specific resolved outcome.
function passesPrerequisite(def, playthroughId) {
  if (!def.prerequisite_event_definition_id) return true;
  return hasFiredWithOutcome(playthroughId, def.prerequisite_event_definition_id, def.requires_prerequisite_outcome);
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
export async function runEventEngine({ sessionId, playthroughId, roomTemplateId, userMessage, aiResponseText, mentionedCharacterIds = null }) {
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
    if (!passesPrerequisite(def, playthroughId)) continue;

    const override = getOverride(roomTemplateId, def.id);
    // 'outcome'-phase conditions are checked separately, after the event has
    // already fired (see below) — they don't gate whether it fires at all.
    const triggerConditions = def.conditions.filter((c) => c.phase !== 'outcome');
    const results = await Promise.all(
      triggerConditions.map((condition) =>
        evaluateCondition(condition, {
          ...baseCtx,
          eventDefinitionId: def.id,
          overrideProbability: condition.condition_type === 'probability' ? override?.override_probability : undefined,
        }),
      ),
    );
    const passed = def.condition_logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
    if (passed) eligible.push(def);
  }

  const firing = resolveExclusiveGroups(eligible);
  const fired = [];

  for (const def of firing) {
    // Success/failure outcome branching (chat enhancement backlog item 5):
    // when enabled, a second condition set (phase='outcome') determines
    // which of the event's actions actually run. Disabled by default so
    // pre-existing events keep firing every action unconditionally.
    let outcome = null;
    if (def.has_outcome_branch) {
      const outcomeConditions = def.conditions.filter((c) => c.phase === 'outcome');
      const outcomeResults = await Promise.all(
        outcomeConditions.map((condition) => evaluateCondition(condition, { ...baseCtx, eventDefinitionId: def.id })),
      );
      const outcomePassed = def.outcome_logic === 'OR' ? outcomeResults.some(Boolean) : outcomeResults.every(Boolean);
      outcome = outcomePassed ? 'success' : 'failure';
    }

    // Recorded with the resolved outcome (if any) so a later event's
    // prerequisite check can require a specific success/failure result.
    recordFire(playthroughId, def.id, turnNumber, outcome);

    const actionResults = [];
    for (const action of def.actions) {
      if (outcome && action.outcome !== 'always' && action.outcome !== outcome) continue;

      // Actions run sequentially and re-fetch session state as needed, so a
      // character_join earlier in this same event is visible to a later
      // change_relationship/generate_image action in the same firing.
      const execCtx = { sessionId, playthroughId, roomTemplateId, session: getRoomSession(sessionId), turnNumber, mentionedCharacterIds };
      const result = await executeAction(action, execCtx);
      actionResults.push({ actionType: action.action_type, result });
    }
    fired.push({ eventDefinitionId: def.id, name: def.name, outcome, actionResults });
  }

  return fired;
}
