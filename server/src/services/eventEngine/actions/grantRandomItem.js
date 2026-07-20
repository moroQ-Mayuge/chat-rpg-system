import { addItemToInventory } from '../../../db/repositories/inventoryRepo.js';

// Same weighted-pick algorithm as worldRoomSlotAssignmentsRepo.js's/
// characterJoin.js's pickWeighted, but operating directly on the {weight}
// already present in each pool entry rather than looking it up from a
// characters row.
function pickWeighted(pool) {
  const total = pool.reduce((sum, entry) => sum + (entry.weight ?? 1), 0);
  let roll = Math.random() * total;
  for (const entry of pool) {
    roll -= entry.weight ?? 1;
    if (roll <= 0) return entry.item_id;
  }
  return pool[pool.length - 1].item_id;
}

// { pool: [{ item_id, weight }], quantity? } — picks one item_id from pool
// by weight and grants it (player inventory only, matching grant_item).
// For "use an item to probabilistically obtain one of several possible
// items" content (e.g. fishing with a rod at a river/sea room) where
// grant_item's single fixed item_id can't vary the outcome.
export async function executeGrantRandomItem(params, execCtx) {
  const { pool = [], quantity = 1 } = params;
  if (pool.length === 0) return { skipped: true, reason: 'empty_pool' };

  const itemId = pickWeighted(pool);
  const row = addItemToInventory(execCtx.playthroughId, itemId, quantity);
  return { item_id: itemId, quantity: row.quantity };
}
