import { getMoney } from '../../../db/repositories/playthroughsRepo.js';

import { compareNumber as compare } from './compare.js';

// { comparison, value } — checks playthroughs.money against value. Used to
// gate paid events (e.g. 有料イチャコラ) so they simply don't fire when the
// player can't afford them, same "silent non-fire" convention as every other
// trigger condition in this engine (no dedicated "insufficient funds" line).
export function evaluateHasMoney(params, ctx) {
  return compare(getMoney(ctx.playthroughId), params.comparison, params.value);
}
