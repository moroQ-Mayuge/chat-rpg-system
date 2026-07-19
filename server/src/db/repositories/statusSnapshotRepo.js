import { listSelfStatAxes } from './relationshipAxesRepo.js';
import { getValue } from './relationshipStatesRepo.js';
import { listActiveStatuses } from './characterStatusStatesRepo.js';

// Assembles a character's current game-state snapshot (self-stats, active
// category statuses, active exclusive_group "stage" statuses) for チャット欄
// のステータス表示 — shared by roomSessionsRepo.js's attachParticipants (live
// values) and messagesRepo.js's createMessage (a frozen snapshot at
// speak-time). "stages" holds every active status that carries an
// exclusive_group (see 0026_relationship_stage_and_address.sql) — a
// character can have more than one exclusive_group family active at once
// (e.g. 関係 alongside undress_state), so this is an array, not a single
// slot. All display-visibility gating still uses the one "relationship_stage"
// category toggle (status_display_settings) regardless of which
// exclusive_group family a given stage belongs to.
// roomSessionCharacterId (2026-07-19, migration 0045): scopes self-stats/
// statuses to one specific duplicate mob instance, when known -- see
// relationshipStatesRepo.js/characterStatusStatesRepo.js, which both ignore
// it for non-mob characters, so passing it is always safe.
export function buildStatusSnapshot(playthroughId, characterId, { roomSessionId, roomSessionCharacterId }) {
  const selfStats = listSelfStatAxes().map((axis) => ({
    axis_id: axis.id,
    name: axis.name,
    value: getValue(playthroughId, characterId, axis.id, roomSessionId, roomSessionCharacterId),
    min: axis.min_value,
    max: axis.max_value,
  }));

  const activeStatuses = listActiveStatuses(characterId, { playthroughId, roomSessionId, roomSessionCharacterId });
  const statuses = activeStatuses.filter((s) => !s.exclusive_group).map((s) => ({ id: s.status_id, name: s.name }));
  const stages = activeStatuses
    .filter((s) => s.exclusive_group)
    .map((s) => ({ id: s.status_id, name: s.name, exclusive_group: s.exclusive_group }));

  return { self_stats: selfStats, statuses, stages };
}
