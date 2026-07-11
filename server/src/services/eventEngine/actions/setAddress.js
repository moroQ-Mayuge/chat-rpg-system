import { setCurrentAddress } from '../../../db/repositories/characterAddressStatesRepo.js';

// { character_id: number|"all_present", address: string }
export async function executeSetAddress(params, execCtx) {
  const { character_id, address } = params;
  const targetIds = character_id === 'all_present' ? execCtx.session.participants.map((p) => p.character_id) : [character_id];
  const changes = targetIds.map((id) => ({ character_id: id, ...setCurrentAddress(execCtx.playthroughId, id, address) }));
  return { changes };
}
