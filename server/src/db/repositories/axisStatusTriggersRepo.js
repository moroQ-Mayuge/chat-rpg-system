import { db } from '../connection.js';
import { grantStatus, removeStatus, hasStatus, isLocked } from './characterStatusStatesRepo.js';

function compare(value, comparison, target) {
  if (comparison === '>=') return value >= target;
  if (comparison === '<=') return value <= target;
  if (comparison === '==') return value === target;
  if (comparison === '>') return value > target;
  if (comparison === '<') return value < target;
  return false;
}

export function listTriggersForAxis(axisId) {
  return db.prepare('SELECT * FROM axis_status_triggers WHERE relationship_axis_id = ?').all(axisId);
}

export function listAllTriggers() {
  return db.prepare('SELECT * FROM axis_status_triggers ORDER BY id').all();
}

export function createTrigger({ relationship_axis_id, comparison, threshold_value, status_id }) {
  const result = db
    .prepare('INSERT INTO axis_status_triggers (relationship_axis_id, comparison, threshold_value, status_id) VALUES (?, ?, ?, ?)')
    .run(relationship_axis_id, comparison, threshold_value, status_id);
  return db.prepare('SELECT * FROM axis_status_triggers WHERE id = ?').get(result.lastInsertRowid);
}

export function deleteTrigger(id) {
  db.prepare('DELETE FROM axis_status_triggers WHERE id = ?').run(id);
  return { deleted: true };
}

// Finds the room_session a character is currently an active participant of
// within this playthrough, needed to resolve session/accompanying-scoped
// statuses. A raw query rather than importing roomSessionsRepo.js, since that
// module imports playthroughsRepo.js which imports relationshipStatesRepo.js
// which calls into this file — importing roomSessionsRepo.js here would cycle.
function findActiveRoomSessionId(playthroughId, characterId) {
  const row = db
    .prepare(
      `SELECT rs.id FROM room_sessions rs
       JOIN room_session_characters rsc ON rsc.room_session_id = rs.id
       WHERE rs.playthrough_id = ? AND rsc.character_id = ? AND rsc.is_active = 1
       ORDER BY rs.id DESC LIMIT 1`,
    )
    .get(playthroughId, characterId);
  return row?.id ?? null;
}

// How "strict" (hard to satisfy) a trigger's condition is, used to order
// grants so that when several thresholds on the same axis become met at once
// (e.g. a big favorability jump satisfies 他人/顔見知り/友人/恋人 all in one
// go), the loosest is granted first and the strictest last — within a shared
// exclusive_group, each later grant evicts the previous one (see
// characterStatusStatesRepo.js's grantStatus), so only the single most
// advanced matching stage survives the cascade.
function strictness(trigger) {
  if (trigger.comparison === '>=' || trigger.comparison === '>') return trigger.threshold_value;
  if (trigger.comparison === '<=' || trigger.comparison === '<') return -trigger.threshold_value;
  return 0;
}

// Called after any relationship_axes value change (see relationshipStatesRepo.js's
// adjustValue) to auto-grant/auto-clear statuses whose threshold the new value
// now crosses. Auto-grant is skipped once the status is already active (so it
// can never clobber a lock set via the change_status action's lock operation);
// auto-clear is skipped while the status is locked. Automatic grants pass
// respectLockWhenEvicting so a locked exclusive_group member (e.g. a manually
// pinned relationship stage) blocks the whole cascade until explicitly unlocked
// or explicitly replaced via change_status.
export function evaluateAxisStatusTriggers(playthroughId, characterId, axisId, newValue) {
  const triggers = listTriggersForAxis(axisId);
  if (triggers.length === 0) return;
  const roomSessionId = findActiveRoomSessionId(playthroughId, characterId);
  const ctx = { playthroughId, roomSessionId };

  const sorted = [...triggers].sort((a, b) => strictness(a) - strictness(b));
  for (const trigger of sorted) {
    const met = compare(newValue, trigger.comparison, trigger.threshold_value);
    const active = hasStatus(characterId, trigger.status_id, ctx);
    if (met && !active) {
      grantStatus(characterId, trigger.status_id, ctx, false, { respectLockWhenEvicting: true });
    }
  }
  for (const trigger of triggers) {
    const met = compare(newValue, trigger.comparison, trigger.threshold_value);
    const active = hasStatus(characterId, trigger.status_id, ctx);
    if (!met && active && !isLocked(characterId, trigger.status_id, ctx)) {
      removeStatus(characterId, trigger.status_id, ctx);
    }
  }
}
