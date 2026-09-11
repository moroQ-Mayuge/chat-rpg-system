import { getRoomSession } from '../../db/repositories/roomSessionsRepo.js';
import { listActiveEventDefinitionsForRoomTemplate } from '../../db/repositories/eventDefinitionsRepo.js';
import { countUserTurnsForPlaythrough } from '../../db/repositories/messagesRepo.js';
import { getAllFlags, getFlag } from '../../db/repositories/sessionFlagsRepo.js';
import { getFireCount, getLastFireTurn, recordFire, hasFiredWithOutcome } from '../../db/repositories/eventFireHistoryRepo.js';
import { getOverride } from '../../db/repositories/roomTemplateEventsRepo.js';
import { evaluateCondition, getMatchingCharacters } from './conditions/registry.js';
import { executeAction } from './actions/registry.js';

// Deliberate simplification vs. SPEC.md 3.6.1's literal staged before/after-LLM-call
// evaluation: since no action ever actually fires until after the LLM response is
// available anyway (step 5 happens after step 3), all condition types — including
// keyword's user_message/ai_response targets — are evaluated together in one pass
// once both texts are on hand.
//
// preResolution.js's dry-run pass (2026-09-11) evaluates a restricted subset of
// this same logic BEFORE generation, for definitions whose conditions are
// structurally guaranteed not to depend on aiResponseText (see
// preResolutionEligibility.js) — resolvedConditionCache below is how its
// results reach this pass without re-rolling.
//
// characterId scopes the cooldown/max_fires check itself (per_character_firing's
// per-candidate gate below) -- left at its default null for the ordinary,
// event-wide check every non-per_character_firing def still uses. Rows in
// event_fire_history for such defs are always written with character_id NULL
// (recordFire's own default), so this parameter has no effect on them either way.
function passesCooldownAndMaxFires(def, playthroughId, roomSessionId, turnNumber, characterId = null) {
  const scope = { roomSessionId, resetScope: def.reset_scope, characterId };
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

// Wraps evaluateCondition with an optional id-keyed cache -- condition ids
// (event_conditions.id) are globally unique across every definition, so one
// flat Map is unambiguous no matter how many definitions share it. Used both
// to let the pre-generation dry-run pass (preResolution.js) record its rolls
// (probability included) and to let the normal post-generation pass reuse
// those exact results instead of re-evaluating (re-rolling) them -- without
// this, a probability-based outcome could resolve differently in each pass.
// A def preResolution.js never touched simply has no cache hits here, so it
// evaluates fresh exactly as before this cache existed.
async function evaluateConditionCached(condition, ctx, conditionCache) {
  if (conditionCache?.has(condition.id)) return conditionCache.get(condition.id);
  const result = await evaluateCondition(condition, ctx);
  conditionCache?.set(condition.id, result);
  return result;
}

// Resolves one level of the outcome tree (the root, or a nested node under
// it) and recurses depth-first into whichever child node matches the
// resolved branch -- so a level's own matching actions always run before its
// descendant's, mirroring how the tree reads top-to-bottom in the editor.
// actionResults is one shared flat array across every level (root and all
// descended nodes): roomSessions.js's broadcastRelationshipChanges walks a
// fired event's actionResults as a single flat list, so nesting must not
// change that shape.
//
// dryRun (preResolution.js's pre-generation pass): when true, conditions are
// still evaluated (and cached) and the outcome still computed/recursed into,
// but no action ever executes -- this is what makes calling this ahead of
// generation safe (read-only, no side effects, nothing double-fires later).
async function resolveOutcomeLevel(def, nodeId, depth, outcomeLogic, baseCtx, buildExecCtx, actionResults, noteActionResult, conditionCache, dryRun = false) {
  const ownConditions = def.conditions.filter(
    (c) => (c.outcome_node_id ?? null) === nodeId && (nodeId === null ? c.phase === 'outcome' : true),
  );
  const results = await Promise.all(
    ownConditions.map((condition) => evaluateConditionCached(condition, { ...baseCtx, eventDefinitionId: def.id }, conditionCache)),
  );
  const outcome = (outcomeLogic === 'OR' ? results.some(Boolean) : results.every(Boolean)) ? 'success' : 'failure';

  if (!dryRun) {
    const ownActions = def.actions.filter((a) => (a.outcome_node_id ?? null) === nodeId);
    for (const action of ownActions) {
      if (action.outcome !== 'always' && action.outcome !== outcome) continue;
      const result = await executeAction(action, buildExecCtx());
      noteActionResult?.(result);
      actionResults.push({ actionType: action.action_type, result });
    }
  }

  if (depth < MAX_OUTCOME_NODE_DEPTH) {
    const child = findChildOutcomeNode(def, nodeId, outcome);
    if (child) {
      await resolveOutcomeLevel(
        def,
        child.id,
        depth + 1,
        child.outcome_logic,
        baseCtx,
        buildExecCtx,
        actionResults,
        noteActionResult,
        conditionCache,
        dryRun,
      );
    }
  }

  return outcome;
}

// preResolution.js's entry point for dry-running just the outcome resolution
// of a def it has already determined is firing this turn (via
// computeEligibleEntries below) -- conditions are evaluated and cached
// (including any probability roll), but no action executes. The real
// post-generation runEventEngine call, given the same conditionCache, then
// reuses this exact result instead of re-rolling.
export async function dryRunOutcome(def, baseCtx, conditionCache) {
  return resolveOutcomeLevel(def, null, 0, def.outcome_logic, baseCtx, () => ({}), [], () => {}, conditionCache, true);
}

// Keyed by (exclusive_group, characterId) rather than exclusive_group alone:
// two per_character_firing entries sharing a group should still each get
// their own character's turn (A's "reveal" firing must not block B's later
// "reveal" firing just because they're in the same group) -- only two
// entries about the *same* character in the *same* group are meant to be
// mutually exclusive. characterId is null for every non-per_character_firing
// entry, so their dedup is exactly the old whole-group behavior.
export function resolveExclusiveGroups(eligibleEntries) {
  const seenGroups = new Set();
  const firing = [];
  for (const entry of eligibleEntries) {
    if (entry.def.exclusive_group) {
      const key = `${entry.def.exclusive_group}:${entry.characterId ?? ''}`;
      if (seenGroups.has(key)) continue;
      seenGroups.add(key);
    }
    firing.push(entry);
  }
  return firing;
}

// per_character_firing's candidate narrowing (see 0086_per_character_event_firing.sql).
// Combines whichever of this def's trigger conditions can name a specific
// character (flag_state/has_status/has_outfit/relationship_threshold, see
// conditions/registry.js's getMatchingCharacters) into one candidate id list,
// using the same AND/OR the def's condition_logic already applies to the
// plain boolean pass/fail. Conditions that can't name a character
// (probability/keyword/llm_judge/participant_count/has_item/has_money) are
// ignored here -- they already gated whether the def is eligible at all, via
// the ordinary boolean evaluation the caller ran first.
//
// Returns null when no condition contributed a character list at all (a
// per_character_firing def with no character-scoped condition -- a
// misconfiguration, not an error: the caller falls back to firing once,
// unscoped, same as if the toggle were off).
function computeCandidateCharacterIds(def, triggerConditions, conditionCtxs) {
  const matchedArrays = triggerConditions
    .map((condition, i) => getMatchingCharacters(condition, conditionCtxs[i]))
    .filter((arr) => arr !== null);
  if (matchedArrays.length === 0) return null;
  if (def.condition_logic === 'OR') return [...new Set(matchedArrays.flat())];
  // AND: a character must appear in every contributing condition's own match
  // list, not just satisfy each condition ANYone-present-wise -- this is
  // stricter than (and the whole point of departing from) the plain boolean
  // AND, which only asks "did each condition find *someone*", not "the same
  // someone". reduce with no seed starts from matchedArrays[0], so a single
  // contributing condition returns its own list untouched.
  return matchedArrays.reduce((acc, arr) => acc.filter((id) => arr.includes(id)));
}

// Extracted from runEventEngine so preResolution.js's pre-generation pass can
// compute the exact same eligible-firing set (cooldown/max_fires/
// prerequisite/condition_logic/per_character_firing candidate narrowing) for
// its own restricted subset of definitions, without duplicating any of this
// logic. Read-only w.r.t. game state -- may populate conditionCache (a
// condition's evaluation, including a probability roll, is a side effect of
// evaluateCondition itself, not of this function), never touches the DB
// otherwise. {def, characterId}[] -- characterId is null for every ordinary
// def (one potential firing, exactly as before per_character_firing existed)
// and one entry per qualifying candidate for a per_character_firing def
// (zero, one, or several -- e.g. two mothers reaching the same
// pregnancy_stage on different days each get their own entry once their own
// turn comes up).
export async function computeEligibleEntries(defs, baseCtx, { playthroughId, roomSessionId, turnNumber, roomTemplateId }, conditionCache) {
  const eligible = [];
  for (const def of defs) {
    if (!passesCooldownAndMaxFires(def, playthroughId, roomSessionId, turnNumber)) continue;
    if (!passesPrerequisite(def, playthroughId, roomSessionId)) continue;

    const override = getOverride(roomTemplateId, def.id);
    // 'outcome'-phase conditions are checked separately, after the event has
    // already fired (see below) — they don't gate whether it fires at all.
    const triggerConditions = def.conditions.filter((c) => c.phase !== 'outcome');
    const conditionCtxs = triggerConditions.map((condition) => ({
      ...baseCtx,
      eventDefinitionId: def.id,
      overrideProbability: condition.condition_type === 'probability' ? override?.override_probability : undefined,
    }));
    const results = await Promise.all(
      triggerConditions.map((condition, i) => evaluateConditionCached(condition, conditionCtxs[i], conditionCache)),
    );
    const passed = def.condition_logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
    if (!passed) continue;

    if (!def.per_character_firing) {
      eligible.push({ def, characterId: null });
      continue;
    }

    const candidateIds = computeCandidateCharacterIds(def, triggerConditions, conditionCtxs);
    if (candidateIds === null) {
      eligible.push({ def, characterId: null });
      continue;
    }
    for (const characterId of candidateIds) {
      if (passesCooldownAndMaxFires(def, playthroughId, roomSessionId, turnNumber, characterId)) {
        eligible.push({ def, characterId });
      }
    }
  }
  return eligible;
}

// Runs every active event definition for the room template this session belongs
// to, fires the ones whose conditions + control gates (cooldown/max_fires/
// exclusive_group) pass, and applies their actions in priority order.
//
// resolvedConditionCache: populated by preResolution.js's pre-generation dry
// run for whichever definitions it could safely pre-resolve (see
// preResolutionEligibility.js) -- their condition results (including any
// probability roll) are reused here rather than re-evaluated, so the outcome
// the LLM was hinted about is exactly the outcome that fires. Every other
// definition has no entries in it and evaluates fresh, unchanged from before
// this cache existed.
export async function runEventEngine({
  sessionId,
  playthroughId,
  roomTemplateId,
  userMessage,
  aiResponseText,
  mentionedCharacterIds = null,
  instanceHintByCharacterId = new Map(),
  resolvedConditionCache = new Map(),
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

  const eligible = await computeEligibleEntries(
    defs,
    baseCtx,
    { playthroughId, roomSessionId: sessionId, turnNumber, roomTemplateId },
    resolvedConditionCache,
  );

  const firing = resolveExclusiveGroups(eligible);
  const fired = [];

  // Who character_leave removed earlier in the event currently firing. Since
  // buildExecCtx re-reads the session, a departed character is already gone
  // from participants by the time a later action runs — so an action that
  // wants to act on the one who just left (e.g. giving them a memory of why)
  // has no way to name them, especially under random_from_present where the
  // author can't know the id up front. Reset per event definition below.
  let departedCharacterIds = [];
  const noteActionResult = (result) => {
    if (result?.left != null && !departedCharacterIds.includes(result.left)) departedCharacterIds.push(result.left);
  };

  // Actions run sequentially and re-fetch session state as needed, so a
  // character_join earlier in this same event (root or nested) is visible to
  // a later change_relationship/generate_image action in the same firing.
  //
  // matchedCharacterIds: null for an ordinary firing (character_id:
  // "condition_matched" in an action is meaningless there and resolves to no
  // one); a one-element array for a per_character_firing entry, naming the
  // one candidate this particular firing is about -- see targetResolution.js.
  const buildExecCtx = (characterId) => ({
    sessionId,
    playthroughId,
    roomTemplateId,
    session: getRoomSession(sessionId),
    turnNumber,
    mentionedCharacterIds,
    instanceHintByCharacterId,
    departedCharacterIds,
    matchedCharacterIds: characterId != null ? [characterId] : null,
  });

  for (const { def, characterId } of firing) {
    // Success/failure outcome branching (chat enhancement backlog item 5),
    // extended to an optional nested sub-branch under either resolved
    // branch (see 0061_event_outcome_nesting.sql / resolveOutcomeLevel
    // above). Disabled by default so pre-existing events keep firing every
    // action unconditionally.
    let outcome = null;
    const actionResults = [];
    departedCharacterIds = [];
    const boundBuildExecCtx = () => buildExecCtx(characterId);
    if (def.has_outcome_branch) {
      outcome = await resolveOutcomeLevel(
        def,
        null,
        0,
        def.outcome_logic,
        baseCtx,
        boundBuildExecCtx,
        actionResults,
        noteActionResult,
        resolvedConditionCache,
      );
    } else {
      for (const action of def.actions) {
        const result = await executeAction(action, boundBuildExecCtx());
        noteActionResult(result);
        actionResults.push({ actionType: action.action_type, result });
      }
    }

    // Recorded with the resolved outcome (if any) so a later event's
    // prerequisite check can require a specific success/failure result.
    // Only the ROOT outcome is ever recorded -- nested sub-branch results
    // are purely internal to this one firing's action selection.
    //
    // characterId (possibly null) makes this fire's cooldown/max_fires count
    // against that one character only for a per_character_firing def --
    // see eventFireHistoryRepo.js.
    recordFire(playthroughId, def.id, turnNumber, outcome, sessionId, characterId);

    fired.push({ eventDefinitionId: def.id, name: def.name, outcome, actionResults, characterId });
  }

  return fired;
}
