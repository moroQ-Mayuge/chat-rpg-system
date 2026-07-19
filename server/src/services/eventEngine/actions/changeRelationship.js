import { adjustValue, getValue, getAxis } from '../../../db/repositories/relationshipStatesRepo.js';
import { resolveMentionedList } from '../mentionResolution.js';

// { character_id: number|"all_present"|"mentioned", axis_id, operation: "add"|"subtract"|"set", value, mentioned_limit? }
export async function executeChangeRelationship(params, execCtx) {
  const { character_id, axis_id, operation, value, mentioned_limit } = params;
  const axis = getAxis(axis_id);

  // { character_id, instance_id } pairs, not just character_id -- so
  // duplicate mob instances (see room_slot_row_level_random_and_mob_duplication)
  // are affected independently rather than one shared value. 'all_present'
  // reads each participant's own instance id directly; 'mentioned'/fixed
  // targets consult instanceHintByCharacterId (explicit @mention, falling
  // back to whichever instance most recently spoke this turn -- see
  // roomSessions.js's generateReply). instance_id is undefined when no hint
  // exists, which relationshipStatesRepo.js treats as "apply without
  // instance scoping" (today's shared-across-instances behavior).
  const targets =
    character_id === 'all_present'
      ? execCtx.session.participants.map((p) => ({ character_id: p.character_id, instance_id: p.id }))
      : character_id === 'mentioned'
        ? resolveMentionedList(execCtx.mentionedCharacterIds, mentioned_limit).map((id) => ({
            character_id: id,
            instance_id: execCtx.instanceHintByCharacterId?.get(id),
          }))
        : [{ character_id, instance_id: execCtx.instanceHintByCharacterId?.get(character_id) }];

  // previous_value/axis_name included so the caller (roomSessions.js) can
  // broadcast a relationship-change notice without a second DB round trip.
  const results = targets.map(({ character_id: id, instance_id }) => {
    const previousValue = getValue(execCtx.playthroughId, id, axis_id, execCtx.sessionId, instance_id);
    return {
      character_id: id,
      previous_value: previousValue,
      new_value: adjustValue(execCtx.playthroughId, id, axis_id, operation, value, execCtx.sessionId, instance_id),
      axis_name: axis.name,
    };
  });

  return { changes: results };
}
