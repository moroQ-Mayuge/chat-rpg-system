import { db } from '../connection.js';

// The override_probability on room_template_events lets a globally-scoped
// event have its `probability` condition tuned per-room without needing a
// separate room_template-scoped copy of the event (SPEC.md DB §room_template_events).
export function getOverride(roomTemplateId, eventDefinitionId) {
  return db
    .prepare('SELECT * FROM room_template_events WHERE room_template_id = ? AND event_definition_id = ?')
    .get(roomTemplateId, eventDefinitionId);
}

export function listOverridesForTemplate(roomTemplateId) {
  return db.prepare('SELECT * FROM room_template_events WHERE room_template_id = ?').all(roomTemplateId);
}

export function setOverride(roomTemplateId, eventDefinitionId, overrideProbability) {
  db.prepare(
    `INSERT INTO room_template_events (room_template_id, event_definition_id, override_probability)
     VALUES (?, ?, ?)
     ON CONFLICT (room_template_id, event_definition_id) DO UPDATE SET override_probability = excluded.override_probability`,
  ).run(roomTemplateId, eventDefinitionId, overrideProbability);
}

export function deleteOverride(roomTemplateId, eventDefinitionId) {
  db.prepare('DELETE FROM room_template_events WHERE room_template_id = ? AND event_definition_id = ?').run(
    roomTemplateId,
    eventDefinitionId,
  );
}
