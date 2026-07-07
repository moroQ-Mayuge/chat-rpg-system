import { hasItem as checkHasItem } from '../../../db/repositories/inventoryRepo.js';

// { item_id, negate? } — negate=true checks "does NOT have the item".
// Player inventory only for now (owner_character_id always null).
export function evaluateHasItem(params, ctx) {
  const held = checkHasItem(ctx.playthroughId, params.item_id);
  return params.negate ? !held : held;
}
