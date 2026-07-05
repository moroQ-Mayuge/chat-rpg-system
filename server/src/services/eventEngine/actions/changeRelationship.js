import { adjustValue } from '../../../db/repositories/relationshipStatesRepo.js';

// { character_id: number|"all_present", axis_id, operation: "add"|"subtract"|"set", value }
export async function executeChangeRelationship(params, execCtx) {
  const { character_id, axis_id, operation, value } = params;

  const targetIds = character_id === 'all_present' ? execCtx.session.participants.map((p) => p.character_id) : [character_id];

  const results = targetIds.map((id) => ({
    character_id: id,
    new_value: adjustValue(execCtx.playthroughId, id, axis_id, operation, value),
  }));

  return { changes: results };
}
