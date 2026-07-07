import { addItemToInventory } from '../../../db/repositories/inventoryRepo.js';

// { item_id, quantity? } — player inventory only for now.
export async function executeGrantItem(params, execCtx) {
  const row = addItemToInventory(execCtx.playthroughId, params.item_id, params.quantity ?? 1);
  return { item_id: params.item_id, quantity: row.quantity };
}
