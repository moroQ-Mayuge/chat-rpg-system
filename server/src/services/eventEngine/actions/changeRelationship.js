import { adjustValue, getValue, getAxis } from '../../../db/repositories/relationshipStatesRepo.js';

// { character_id: number|"all_present", axis_id, operation: "add"|"subtract"|"set", value }
export async function executeChangeRelationship(params, execCtx) {
  const { character_id, axis_id, operation, value } = params;
  const axis = getAxis(axis_id);

  const targetIds = character_id === 'all_present' ? execCtx.session.participants.map((p) => p.character_id) : [character_id];

  // previous_value/axis_name included so the caller (roomSessions.js) can
  // broadcast a relationship-change notice without a second DB round trip.
  const results = targetIds.map((id) => {
    const previousValue = getValue(execCtx.playthroughId, id, axis_id);
    return {
      character_id: id,
      previous_value: previousValue,
      new_value: adjustValue(execCtx.playthroughId, id, axis_id, operation, value),
      axis_name: axis.name,
    };
  });

  return { changes: results };
}
