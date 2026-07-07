import { removeItemFromInventory } from '../../../db/repositories/inventoryRepo.js';

// { item_id, quantity? } — player inventory only for now.
export async function executeRemoveItem(params, execCtx) {
  return removeItemFromInventory(execCtx.playthroughId, params.item_id, params.quantity ?? 1);
}
