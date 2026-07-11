import { db } from '../connection.js';
import { getStatus } from './characterStatusesRepo.js';
import { setCurrentAddress } from './characterAddressStatesRepo.js';

// Resolves which scoping key actually applies from the status's own
// persistence_scope — 'playthrough' persists across every room in the
// route (keyed by playthrough_id); 'session'/'accompanying' are tied to a
// single room_sessions row (keyed by room_session_id). 'accompanying'
// statuses get carried over to the new room_session_id on room-move by
// roomSessionsRepo.js's createRoomSession, mirroring how is_accompanying
// participants are carried over — this repo only knows about "this session".
function scopeColumns(status, playthroughId, roomSessionId) {
  if (status.persistence_scope === 'playthrough') {
    return { playthrough_id: playthroughId, room_session_id: null };
  }
  return { playthrough_id: null, room_session_id: roomSessionId };
}

export function listActiveStatuses(characterId, { playthroughId, roomSessionId }) {
  return db
    .prepare(
      `SELECT css.*, cs.name, cs.persistence_scope, cs.removes_from_session
       FROM character_status_states css
       JOIN character_statuses cs ON cs.id = css.status_id
       WHERE css.character_id = ?
         AND ((cs.persistence_scope = 'playthrough' AND css.playthrough_id = ?)
           OR (cs.persistence_scope != 'playthrough' AND css.room_session_id = ?))`,
    )
    .all(characterId, playthroughId, roomSessionId);
}

export function hasStatus(characterId, statusId, ctx) {
  const status = getStatus(statusId);
  if (!status) return false;
  const { playthrough_id, room_session_id } = scopeColumns(status, ctx.playthroughId, ctx.roomSessionId);
  const row = db
    .prepare(
      'SELECT 1 FROM character_status_states WHERE character_id = ? AND status_id = ? AND playthrough_id IS ? AND room_session_id IS ?',
    )
    .get(characterId, statusId, playthrough_id, room_session_id);
  return Boolean(row);
}

// Finds other currently-active statuses sharing this exclusive_group for the
// same character, so grantStatus can evict them — mirrors listActiveStatuses'
// scope-matching WHERE clause (each sibling row already stores which of
// playthrough_id/room_session_id applies, based on its own persistence_scope).
function findActiveExclusiveGroupSiblings(characterId, exclusiveGroup, excludeStatusId, ctx) {
  return db
    .prepare(
      `SELECT css.status_id, css.locked
       FROM character_status_states css
       JOIN character_statuses cs ON cs.id = css.status_id
       WHERE css.character_id = ? AND cs.exclusive_group = ? AND css.status_id != ?
         AND ((cs.persistence_scope = 'playthrough' AND css.playthrough_id = ?)
           OR (cs.persistence_scope != 'playthrough' AND css.room_session_id = ?))`,
    )
    .all(characterId, exclusiveGroup, excludeStatusId, ctx.playthroughId, ctx.roomSessionId);
}

// Re-granting an already-active status just updates its lock flag rather
// than inserting a duplicate row.
//
// options.respectLockWhenEvicting: when this status has an exclusive_group
// and another status in that group is currently active+locked, the eviction
// (and therefore the whole grant) is skipped entirely rather than forcing the
// swap — used by axis_status_triggers' automatic grants so a locked stage
// can't be silently replaced by a passive value change. Explicit change_status
// grants leave this false (default), so they can always force the swap,
// mirroring how explicit removeStatus always works regardless of lock.
export function grantStatus(characterId, statusId, ctx, locked = false, options = {}) {
  const { respectLockWhenEvicting = false } = options;
  const status = getStatus(statusId);

  if (status.exclusive_group) {
    const siblings = findActiveExclusiveGroupSiblings(characterId, status.exclusive_group, statusId, ctx);
    if (respectLockWhenEvicting && siblings.some((s) => s.locked)) {
      return { skipped: true, reason: 'exclusive_group_locked' };
    }
    for (const sibling of siblings) {
      removeStatus(characterId, sibling.status_id, ctx);
    }
  }

  const { playthrough_id, room_session_id } = scopeColumns(status, ctx.playthroughId, ctx.roomSessionId);
  const existing = db
    .prepare(
      'SELECT id FROM character_status_states WHERE character_id = ? AND status_id = ? AND playthrough_id IS ? AND room_session_id IS ?',
    )
    .get(characterId, statusId, playthrough_id, room_session_id);
  let result;
  if (existing) {
    db.prepare('UPDATE character_status_states SET locked = ? WHERE id = ?').run(locked ? 1 : 0, existing.id);
    result = { id: existing.id, granted: false, alreadyActive: true };
  } else {
    const inserted = db
      .prepare(
        'INSERT INTO character_status_states (status_id, character_id, playthrough_id, room_session_id, locked) VALUES (?, ?, ?, ?, ?)',
      )
      .run(statusId, characterId, playthrough_id, room_session_id, locked ? 1 : 0);
    result = { id: inserted.lastInsertRowid, granted: true };
  }

  // A raw update rather than roomSessionsRepo.js's removeParticipant, since
  // importing that here would cycle back through playthroughsRepo.js ->
  // relationshipStatesRepo.js -> axisStatusTriggersRepo.js -> this file.
  if (status.removes_from_session && ctx.roomSessionId != null) {
    db.prepare(
      `UPDATE room_session_characters SET is_active = 0, left_at = datetime('now')
       WHERE room_session_id = ? AND character_id = ?`,
    ).run(ctx.roomSessionId, characterId);
  }

  if (status.default_address_on_grant && ctx.playthroughId != null) {
    setCurrentAddress(ctx.playthroughId, characterId, status.default_address_on_grant);
  }

  return result;
}

// Copies a character's currently-active 'accompanying'-scoped statuses from
// one room_session to another — called by roomSessionsRepo.js's
// createRoomSession when a character carries over via is_accompanying on a
// room移動, mirroring how the participant row itself is carried over.
export function carryOverAccompanyingStatuses(characterId, fromRoomSessionId, toRoomSessionId) {
  const rows = db
    .prepare(
      `SELECT css.status_id, css.locked
       FROM character_status_states css
       JOIN character_statuses cs ON cs.id = css.status_id
       WHERE css.character_id = ? AND css.room_session_id = ? AND cs.persistence_scope = 'accompanying'`,
    )
    .all(characterId, fromRoomSessionId);
  for (const row of rows) {
    db.prepare(
      'INSERT INTO character_status_states (status_id, character_id, playthrough_id, room_session_id, locked) VALUES (?, ?, NULL, ?, ?)',
    ).run(row.status_id, characterId, toRoomSessionId, row.locked);
  }
}

// Explicit removal always works regardless of locked — the lock only
// suppresses *automatic* threshold-based clearing (see axis_status_triggers,
// a later unit), not a deliberate change_status(operation:'remove') call.
export function removeStatus(characterId, statusId, ctx) {
  const status = getStatus(statusId);
  const { playthrough_id, room_session_id } = scopeColumns(status, ctx.playthroughId, ctx.roomSessionId);
  const result = db
    .prepare(
      'DELETE FROM character_status_states WHERE character_id = ? AND status_id = ? AND playthrough_id IS ? AND room_session_id IS ?',
    )
    .run(characterId, statusId, playthrough_id, room_session_id);
  return { removed: result.changes > 0 };
}

export function isLocked(characterId, statusId, ctx) {
  const status = getStatus(statusId);
  if (!status) return false;
  const { playthrough_id, room_session_id } = scopeColumns(status, ctx.playthroughId, ctx.roomSessionId);
  const row = db
    .prepare(
      'SELECT locked FROM character_status_states WHERE character_id = ? AND status_id = ? AND playthrough_id IS ? AND room_session_id IS ?',
    )
    .get(characterId, statusId, playthrough_id, room_session_id);
  return row ? Boolean(row.locked) : false;
}

export function setStatusLocked(characterId, statusId, ctx, locked) {
  const status = getStatus(statusId);
  const { playthrough_id, room_session_id } = scopeColumns(status, ctx.playthroughId, ctx.roomSessionId);
  db.prepare(
    'UPDATE character_status_states SET locked = ? WHERE character_id = ? AND status_id = ? AND playthrough_id IS ? AND room_session_id IS ?',
  ).run(locked ? 1 : 0, characterId, statusId, playthrough_id, room_session_id);
  return { locked };
}
