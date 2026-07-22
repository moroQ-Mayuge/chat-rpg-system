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
function passesCooldownAndMaxFires(def, playthroughId, roomSessionId, turnNumber) {
  const scope = { roomSessionId, resetScope: def.reset_scope };
  if (def.max_fires_per_session != null && getFireCount(playthroughId, def.id, scope) >= def.max_fires_per_session) {
    return false;
  }
  if (def.cooldown_turns > 0) {
    const lastFire = getLastFireTurn(playthroughId, def.id, scope);
    if (lastFire != null && turnNumber - lastFire < def.cooldown_turns) return false;
  }
  return true;
}

// Event chaining (chat enhancement backlog item 6): if this event names a
// prerequisite, it isn't eligible until that prerequisite has fired —
// optionally requiring a specific resolved outcome. Scoped by *this* event's
// own prerequisite_reset_scope (not the prerequisite event's reset_scope):
// the decision of whether a staged chain like イチャイチャする→キスする should
// stay unlocked for the whole route or reset on leaving the room belongs to
// the event doing the requiring (see 0037_event_fire_reset_scope.sql).
function passesPrerequisite(def, playthroughId, roomSessionId) {
  if (!def.prerequisite_event_definition_id) return true;
  return hasFiredWithOutcome(playthroughId, def.prerequisite_event_definition_id, def.requires_prerequisite_outcome, {
    roomSessionId,
    resetScope: def.prerequisite_reset_scope,
  });
}

// Mirrored in server/src/db/repositories/eventDefinitionsRepo.js and
// client/src/pages/EventsPage.jsx -- see 0061_event_outcome_nesting.sql for
// why (form/QA-burden cap, not a schema limitation). Enforced here too
// (not just at save time) as a defensive guard against any data that
// somehow violates it (a stale export, a hand-edited DB row, etc.).
const MAX_OUTCOME_NODE_DEPTH = 2;

function findChildOutcomeNode(def, parentNodeId, branchKey) {
  return def.outcome_nodes.find((n) => (n.parent_node_id ?? null) === parentNodeId && n.branch_key === branchKey);
}

// Resolves one level of the outcome tree (the root, or a nested node under
// it) and recurses depth-first into whichever child node matches the
// resolved branch -- so a level's own matching actions always run before its
// descendant's, mirroring how the tree reads top-to-bottom in the editor.
// actionResults is one shared flat array across every level (root and all
// descended nodes): roomSessions.js's broadcastRelationshipChanges walks a
// fired event's actionResults as a single flat list, so nesting must not
// change that shape.
async function resolveOutcomeLevel(def, nodeId, depth, outcomeLogic, baseCtx, buildExecCtx, actionResults) {
  const ownConditions = def.conditions.filter(
    (c) => (c.outcome_node_id ?? null) === nodeId && (nodeId === null ? c.phase === 'outcome' : true),
  );
  const results = await Promise.all(
    ownConditions.map((condition) => evaluateCondition(condition, { ...baseCtx, eventDefinitionId: def.id })),
  );
  const outcome = (outcomeLogic === 'OR' ? results.some(Boolean) : results.every(Boolean)) ? 'success' : 'failure';

  const ownActions = def.actions.filter((a) => (a.outcome_node_id ?? null) === nodeId);
  for (const action of ownActions) {
    if (action.outcome !== 'always' && action.outcome !== outcome) continue;
    const result = await executeAction(action, buildExecCtx());
    actionResults.push({ actionType: action.action_type, result });
  }

  if (depth < MAX_OUTCOME_NODE_DEPTH) {
    const child = findChildOutcomeNode(def, nodeId, outcome);
    if (child) {
      await resolveOutcomeLevel(def, child.id, depth + 1, child.outcome_logic, baseCtx, buildExecCtx, actionResults);
    }
  }

  return outcome;
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
export async function runEventEngine({
  sessionId,
  playthroughId,
  roomTemplateId,
  userMessage,
  aiResponseText,
  mentionedCharacterIds = null,
  instanceHintByCharacterId = new Map(),
}) {
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
    mentionedCharacterIds,
    flagSetAtTurn: (flagKey) => getFlag(playthroughId, flagKey)?.set_at_turn ?? null,
  };

  const eligible = [];
  for (const def of defs) {
    if (!passesCooldownAndMaxFires(def, playthroughId, sessionId, turnNumber)) continue;
    if (!passesPrerequisite(def, playthroughId, sessionId)) continue;

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

  // Actions run sequentially and re-fetch session state as needed, so a
  // character_join earlier in this same event (root or nested) is visible to
  // a later change_relationship/generate_image action in the same firing.
  const buildExecCtx = () => ({
    sessionId,
    playthroughId,
    roomTemplateId,
    session: getRoomSession(sessionId),
    turnNumber,
    mentionedCharacterIds,
    instanceHintByCharacterId,
  });

  for (const def of firing) {
    // Success/failure outcome branching (chat enhancement backlog item 5),
    // extended to an optional nested sub-branch under either resolved
    // branch (see 0061_event_outcome_nesting.sql / resolveOutcomeLevel
    // above). Disabled by default so pre-existing events keep firing every
    // action unconditionally.
    let outcome = null;
    const actionResults = [];
    if (def.has_outcome_branch) {
      outcome = await resolveOutcomeLevel(def, null, 0, def.outcome_logic, baseCtx, buildExecCtx, actionResults);
    } else {
      for (const action of def.actions) {
        const result = await executeAction(action, buildExecCtx());
        actionResults.push({ actionType: action.action_type, result });
      }
    }

    // Recorded with the resolved outcome (if any) so a later event's
    // prerequisite check can require a specific success/failure result.
    // Only the ROOT outcome is ever recorded -- nested sub-branch results
    // are purely internal to this one firing's action selection.
    recordFire(playthroughId, def.id, turnNumber, outcome, sessionId);

    fired.push({ eventDefinitionId: def.id, name: def.name, outcome, actionResults });
  }

  return fired;
}
