import { setCurrentAddress } from '../../../db/repositories/characterAddressStatesRepo.js';
import { resolveTargetIds } from '../targetResolution.js';
import { resolvePlaceholderText } from '../placeholderResolution.js';

// { character_id: number|"all_present"|"mentioned"|"condition_matched", address: string, mentioned_limit? }
export async function executeSetAddress(params, execCtx) {
  const { character_id, address, mentioned_limit } = params;
  // See changeRelationship.js's identical comment -- {character_id, instance_id}
  // pairs so duplicate mob instances each get their own nickname.
  const targets =
    character_id === 'all_present'
      ? execCtx.session.participants.map((p) => ({ character_id: p.character_id, instance_id: p.id }))
      : resolveTargetIds(character_id, mentioned_limit, execCtx).map((id) => ({
          character_id: id,
          instance_id: execCtx.instanceHintByCharacterId?.get(id),
        }));
  const resolvedAddress = resolvePlaceholderText(address, execCtx);
  const changes = targets.map(({ character_id: id, instance_id }) => ({
    character_id: id,
    ...setCurrentAddress(execCtx.playthroughId, id, resolvedAddress, execCtx.sessionId, instance_id),
  }));
  return { changes };
}
