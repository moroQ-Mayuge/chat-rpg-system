import { db } from '../connection.js';

function attachConditionsAndActions(def) {
  if (!def) return def;
  const conditions = db
    .prepare('SELECT id, condition_type, params, phase FROM event_conditions WHERE event_definition_id = ?')
    .all(def.id)
    .map((c) => ({ ...c, params: JSON.parse(c.params) }));
  const actions = db
    .prepare('SELECT id, action_type, params, outcome FROM event_actions WHERE event_definition_id = ?')
    .all(def.id)
    .map((a) => ({ ...a, params: JSON.parse(a.params) }));
  return { ...def, enabled: Boolean(def.enabled), has_outcome_branch: Boolean(def.has_outcome_branch), conditions, actions };
}

export function listEventDefinitions() {
  return db.prepare('SELECT * FROM event_definitions ORDER BY priority ASC, id ASC').all().map(attachConditionsAndActions);
}

export function getEventDefinition(id) {
  return attachConditionsAndActions(db.prepare('SELECT * FROM event_definitions WHERE id = ?').get(id));
}

function replaceConditionsAndActions(eventDefinitionId, { conditions, actions }) {
  db.prepare('DELETE FROM event_conditions WHERE event_definition_id = ?').run(eventDefinitionId);
  for (const c of conditions ?? []) {
    db.prepare('INSERT INTO event_conditions (event_definition_id, condition_type, params, phase) VALUES (?, ?, ?, ?)').run(
      eventDefinitionId,
      c.condition_type,
      JSON.stringify(c.params ?? {}),
      c.phase ?? 'trigger',
    );
  }
  db.prepare('DELETE FROM event_actions WHERE event_definition_id = ?').run(eventDefinitionId);
  for (const a of actions ?? []) {
    db.prepare('INSERT INTO event_actions (event_definition_id, action_type, params, outcome) VALUES (?, ?, ?, ?)').run(
      eventDefinitionId,
      a.action_type,
      JSON.stringify(a.params ?? {}),
      a.outcome ?? 'always',
    );
  }
}

export function createEventDefinition(data) {
  const result = db
    .prepare(
      `INSERT INTO event_definitions
        (name, scope, room_template_id, enabled, condition_logic, priority, cooldown_turns, max_fires_per_session, exclusive_group,
         has_outcome_branch, outcome_logic)
       VALUES (@name, @scope, @room_template_id, @enabled, @condition_logic, @priority, @cooldown_turns, @max_fires_per_session, @exclusive_group,
               @has_outcome_branch, @outcome_logic)`,
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
    });
  replaceConditionsAndActions(result.lastInsertRowid, data);
  return getEventDefinition(result.lastInsertRowid);
}

export function updateEventDefinition(id, data) {
  db.prepare(
    `UPDATE event_definitions SET
       name = @name, scope = @scope, room_template_id = @room_template_id, enabled = @enabled,
       condition_logic = @condition_logic, priority = @priority, cooldown_turns = @cooldown_turns,
       max_fires_per_session = @max_fires_per_session, exclusive_group = @exclusive_group,
       has_outcome_branch = @has_outcome_branch, outcome_logic = @outcome_logic
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
  });
  replaceConditionsAndActions(id, data);
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
