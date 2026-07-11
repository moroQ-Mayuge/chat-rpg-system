import { listSelfStatAxes } from './relationshipAxesRepo.js';
import { getValue } from './relationshipStatesRepo.js';
import { listActiveStatuses } from './characterStatusStatesRepo.js';

// Assembles a character's current game-state snapshot (self-stats, active
// category statuses, current relationship stage) for チャット欄のステータス
// 表示 — shared by roomSessionsRepo.js's attachParticipants (live values) and
// messagesRepo.js's createMessage (a frozen snapshot at speak-time). The
// "関係" stage is just whichever active status carries an exclusive_group
// (see 0026_relationship_stage_and_address.sql) — no separate lookup needed.
export function buildStatusSnapshot(playthroughId, characterId, { roomSessionId }) {
  const selfStats = listSelfStatAxes().map((axis) => ({
    axis_id: axis.id,
    name: axis.name,
    value: getValue(playthroughId, characterId, axis.id),
    min: axis.min_value,
    max: axis.max_value,
  }));

  const activeStatuses = listActiveStatuses(characterId, { playthroughId, roomSessionId });
  const statuses = activeStatuses.filter((s) => !s.exclusive_group).map((s) => ({ id: s.status_id, name: s.name }));
  const relationshipStageRow = activeStatuses.find((s) => s.exclusive_group);
  const relationship_stage = relationshipStageRow
    ? { id: relationshipStageRow.status_id, name: relationshipStageRow.name, exclusive_group: relationshipStageRow.exclusive_group }
    : null;

  return { self_stats: selfStats, statuses, relationship_stage };
}
