import { setCurrentAddress } from '../../../db/repositories/characterAddressStatesRepo.js';
import { resolveMentionedList } from '../mentionResolution.js';

// { character_id: number|"all_present"|"mentioned", address: string, mentioned_limit? }
export async function executeSetAddress(params, execCtx) {
  const { character_id, address, mentioned_limit } = params;
  // See changeRelationship.js's identical comment -- {character_id, instance_id}
  // pairs so duplicate mob instances each get their own nickname.
  const targets =
    character_id === 'all_present'
      ? execCtx.session.participants.map((p) => ({ character_id: p.character_id, instance_id: p.id }))
      : character_id === 'mentioned'
        ? resolveMentionedList(execCtx.mentionedCharacterIds, mentioned_limit).map((id) => ({
            character_id: id,
            instance_id: execCtx.instanceHintByCharacterId?.get(id),
          }))
        : [{ character_id, instance_id: execCtx.instanceHintByCharacterId?.get(character_id) }];
  const changes = targets.map(({ character_id: id, instance_id }) => ({
    character_id: id,
    ...setCurrentAddress(execCtx.playthroughId, id, address, execCtx.sessionId, instance_id),
  }));
  return { changes };
}
