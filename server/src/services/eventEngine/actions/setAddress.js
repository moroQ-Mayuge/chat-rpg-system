import { setCurrentAddress } from '../../../db/repositories/characterAddressStatesRepo.js';
import { resolveMentionedList } from '../mentionResolution.js';

// { character_id: number|"all_present"|"mentioned", address: string, mentioned_limit? }
export async function executeSetAddress(params, execCtx) {
  const { character_id, address, mentioned_limit } = params;
  const targetIds =
    character_id === 'all_present'
      ? execCtx.session.participants.map((p) => p.character_id)
      : character_id === 'mentioned'
        ? resolveMentionedList(execCtx.mentionedCharacterIds, mentioned_limit)
        : [character_id];
  const changes = targetIds.map((id) => ({ character_id: id, ...setCurrentAddress(execCtx.playthroughId, id, address, execCtx.sessionId) }));
  return { changes };
}
