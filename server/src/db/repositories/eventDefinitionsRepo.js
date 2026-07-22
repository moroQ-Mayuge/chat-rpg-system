import { db } from '../connection.js';
import { listWorldsForRoomTemplate } from './worldRoomTemplatesRepo.js';

function attachConditionsAndActions(def) {
  if (!def) return def;
  const conditions = db
    .prepare('SELECT id, condition_type, params, phase, outcome_node_id FROM event_conditions WHERE event_definition_id = ?')
    .all(def.id)
    .map((c) => ({ ...c, params: JSON.parse(c.params) }));
  const actions = db
    .prepare('SELECT id, action_type, params, outcome, outcome_node_id FROM event_actions WHERE event_definition_id = ?')
    .all(def.id)
    .map((a) => ({ ...a, params: JSON.parse(a.params) }));
  // Nested success/failure branch nodes (see 0061_event_outcome_nesting.sql).
  // A pre-nesting event simply has none of these; conditions/actions with a
  // null outcome_node_id are root-level, exactly as before nesting existed.
  const outcomeNodes = db
    .prepare('SELECT id, parent_node_id, branch_key, outcome_logic, depth FROM event_outcome_nodes WHERE event_definition_id = ?')
    .all(def.id);
  return {
    ...def,
    enabled: Boolean(def.enabled),
    has_outcome_branch: Boolean(def.has_outcome_branch),
    conditions,
    actions,
    outcome_nodes: outcomeNodes,
  };
}

// World affiliation for a 'room_template'-scoped event is transitive, via
// whichever World(s) currently include that room (world_room_templates —
// rooms are shared master data, see 0030_room_world_decoupling.sql). A
// 'global' event applies everywhere and has no World -- used by
// EventsPage.jsx to bucket events into a dedicated "global" group rather
// than the World-unassigned "未分類" fallback.
function attachWorldIds(def) {
  const worldIds = def.scope === 'room_template' && def.room_template_id ? listWorldsForRoomTemplate(def.room_template_id).map((w) => w.id) : [];
  return { ...def, world_ids: worldIds };
}

export function listEventDefinitions() {
  return db
    .prepare('SELECT * FROM event_definitions ORDER BY priority ASC, id ASC')
    .all()
    .map(attachConditionsAndActions)
    .map(attachWorldIds);
}

export function getEventDefinition(id) {
  return attachConditionsAndActions(db.prepare('SELECT * FROM event_definitions WHERE id = ?').get(id));
}

// Mirrored in server/src/services/eventEngine/index.js and
// client/src/pages/EventsPage.jsx -- see 0061_event_outcome_nesting.sql for
// why (form/QA-burden cap, not a schema limitation).
const MAX_OUTCOME_NODE_DEPTH = 2;

// Client-submitted nodes carry an `id` that's only meaningful within this one
// save payload (could be a real id from a previously-saved node, or a
// client-generated temp key for a brand-new one) -- everything in this table
// is delete-and-reinserted every save anyway (same convention as
// conditions/actions below), so there's no need to distinguish the two.
// Inserts parent-before-child (the depth cap keeps this to at most 2 passes)
// and returns a Map from that submitted id to the real inserted row id, so
// conditions/actions can resolve their own outcome_node_id references below.
function insertOutcomeNodes(eventDefinitionId, hasOutcomeBranch, nodes) {
  const idMap = new Map();
  if (!hasOutcomeBranch || !nodes || nodes.length === 0) return idMap;

  const depthById = new Map();
  const seenSlotKeys = new Set();
  const remaining = [...nodes];
  let guard = remaining.length + 1;
  while (remaining.length > 0) {
    if (guard-- <= 0) throw new Error('分岐ノードの親子関係が不正です（循環参照または存在しない親を参照しています）');
    let progressed = false;
    for (let i = remaining.length - 1; i >= 0; i--) {
      const node = remaining[i];
      const parentResolved = node.parent_node_id == null || idMap.has(node.parent_node_id);
      if (!parentResolved) continue;

      const realParentId = node.parent_node_id == null ? null : idMap.get(node.parent_node_id);
      const depth = realParentId == null ? 1 : depthById.get(realParentId) + 1;
      if (depth > MAX_OUTCOME_NODE_DEPTH) throw new Error(`分岐の深さが上限（${MAX_OUTCOME_NODE_DEPTH}段）を超えています`);

      const slotKey = `${realParentId ?? 'root'}:${node.branch_key}`;
      if (seenSlotKeys.has(slotKey)) throw new Error('同じ分岐に複数の入れ子ノードが指定されています');
      seenSlotKeys.add(slotKey);

      const result = db
        .prepare(
          'INSERT INTO event_outcome_nodes (event_definition_id, parent_node_id, branch_key, outcome_logic, depth) VALUES (?, ?, ?, ?, ?)',
        )
        .run(eventDefinitionId, realParentId, node.branch_key, node.outcome_logic ?? 'AND', depth);
      idMap.set(node.id, result.lastInsertRowid);
      depthById.set(result.lastInsertRowid, depth);
      remaining.splice(i, 1);
      progressed = true;
    }
    if (!progressed) throw new Error('分岐ノードの親子関係が不正です（循環参照または存在しない親を参照しています）');
  }
  return idMap;
}

function replaceConditionsAndActions(eventDefinitionId, { conditions, actions, outcome_nodes, has_outcome_branch }) {
  db.prepare('DELETE FROM event_conditions WHERE event_definition_id = ?').run(eventDefinitionId);
  db.prepare('DELETE FROM event_actions WHERE event_definition_id = ?').run(eventDefinitionId);
  db.prepare('DELETE FROM event_outcome_nodes WHERE event_definition_id = ?').run(eventDefinitionId);

  // has_outcome_branch=false silently drops any submitted nodes rather than
  // erroring -- nesting is meaningless without a root outcome to hang off,
  // matching this app's existing tolerant-toggle style elsewhere.
  const nodeIdMap = insertOutcomeNodes(eventDefinitionId, has_outcome_branch, outcome_nodes);

  for (const c of conditions ?? []) {
    const outcomeNodeId = c.outcome_node_id != null ? nodeIdMap.get(c.outcome_node_id) ?? null : null;
    db.prepare(
      'INSERT INTO event_conditions (event_definition_id, condition_type, params, phase, outcome_node_id) VALUES (?, ?, ?, ?, ?)',
    ).run(eventDefinitionId, c.condition_type, JSON.stringify(c.params ?? {}), c.phase ?? 'trigger', outcomeNodeId);
  }
  for (const a of actions ?? []) {
    const outcomeNodeId = a.outcome_node_id != null ? nodeIdMap.get(a.outcome_node_id) ?? null : null;
    db.prepare(
      'INSERT INTO event_actions (event_definition_id, action_type, params, outcome, outcome_node_id) VALUES (?, ?, ?, ?, ?)',
    ).run(eventDefinitionId, a.action_type, JSON.stringify(a.params ?? {}), a.outcome ?? 'always', outcomeNodeId);
  }
}

export function createEventDefinition(data) {
  const create = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO event_definitions
          (name, scope, room_template_id, enabled, condition_logic, priority, cooldown_turns, max_fires_per_session, exclusive_group,
           has_outcome_branch, outcome_logic, prerequisite_event_definition_id, requires_prerequisite_outcome,
           reset_scope, prerequisite_reset_scope)
         VALUES (@name, @scope, @room_template_id, @enabled, @condition_logic, @priority, @cooldown_turns, @max_fires_per_session, @exclusive_group,
                 @has_outcome_branch, @outcome_logic, @prerequisite_event_definition_id, @requires_prerequisite_outcome,
                 @reset_scope, @prerequisite_reset_scope)`,
      )
      .run({
        name: data.name,
        scope: data.scope ?? 'global',
        room_template_id: data.scope === 'room_template' ? data.room_template_id : null,
        enabled: data.enabled ?? true ? 1 : 0,
        condition_logic: data.condition_logic ?? 'AND',
        priority: data.priority ?? 0,
        cooldown_turns: data.cooldown_turns ?? 0,
        max_fires_per_session: data.max_fires_per_session ?? null,
        exclusive_group: data.exclusive_group ?? null,
        has_outcome_branch: data.has_outcome_branch ? 1 : 0,
        outcome_logic: data.outcome_logic ?? 'AND',
        prerequisite_event_definition_id: data.prerequisite_event_definition_id ?? null,
        requires_prerequisite_outcome: data.requires_prerequisite_outcome ?? 'any',
        reset_scope: data.reset_scope ?? 'playthrough',
        prerequisite_reset_scope: data.prerequisite_reset_scope ?? 'playthrough',
      });
    replaceConditionsAndActions(result.lastInsertRowid, data);
    return result.lastInsertRowid;
  });
  return getEventDefinition(create());
}

export function updateEventDefinition(id, data) {
  const update = db.transaction(() => {
    db.prepare(
      `UPDATE event_definitions SET
         name = @name, scope = @scope, room_template_id = @room_template_id, enabled = @enabled,
         condition_logic = @condition_logic, priority = @priority, cooldown_turns = @cooldown_turns,
         max_fires_per_session = @max_fires_per_session, exclusive_group = @exclusive_group,
         has_outcome_branch = @has_outcome_branch, outcome_logic = @outcome_logic,
         prerequisite_event_definition_id = @prerequisite_event_definition_id, requires_prerequisite_outcome = @requires_prerequisite_outcome,
         reset_scope = @reset_scope, prerequisite_reset_scope = @prerequisite_reset_scope
       WHERE id = @id`,
    ).run({
      id,
      name: data.name,
      scope: data.scope ?? 'global',
      room_template_id: data.scope === 'room_template' ? data.room_template_id : null,
      enabled: (data.enabled ?? true) ? 1 : 0,
      condition_logic: data.condition_logic ?? 'AND',
      priority: data.priority ?? 0,
      cooldown_turns: data.cooldown_turns ?? 0,
      max_fires_per_session: data.max_fires_per_session ?? null,
      exclusive_group: data.exclusive_group ?? null,
      has_outcome_branch: data.has_outcome_branch ? 1 : 0,
      outcome_logic: data.outcome_logic ?? 'AND',
      prerequisite_event_definition_id: data.prerequisite_event_definition_id ?? null,
      requires_prerequisite_outcome: data.requires_prerequisite_outcome ?? 'any',
      reset_scope: data.reset_scope ?? 'playthrough',
      prerequisite_reset_scope: data.prerequisite_reset_scope ?? 'playthrough',
    });
    replaceConditionsAndActions(id, data);
  });
  update();
  return getEventDefinition(id);
}

export function deleteEventDefinition(id) {
  db.prepare('DELETE FROM event_definitions WHERE id = ?').run(id);
  return { deleted: true };
}

// Definitions active for a given room template: global-scope events, plus
// room_template-scoped events for that specific template, both enabled.
export function listActiveEventDefinitionsForRoomTemplate(roomTemplateId) {
  return db
    .prepare(
      `SELECT * FROM event_definitions
       WHERE enabled = 1 AND (scope = 'global' OR (scope = 'room_template' AND room_template_id = ?))
       ORDER BY priority ASC, id ASC`,
    )
    .all(roomTemplateId)
    .map(attachConditionsAndActions);
}
