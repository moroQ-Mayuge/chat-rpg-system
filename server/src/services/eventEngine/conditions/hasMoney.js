import { getMoney } from '../../../db/repositories/playthroughsRepo.js';

function compare(value, comparison, target) {
  if (comparison === '>=') return value >= target;
  if (comparison === '<=') return value <= target;
  if (comparison === '==') return value === target;
  if (comparison === '>') return value > target;
  if (comparison === '<') return value < target;
  return false;
}

// { comparison, value } — checks playthroughs.money against value. Used to
// gate paid events (e.g. 有料イチャコラ) so they simply don't fire when the
// player can't afford them, same "silent non-fire" convention as every other
// trigger condition in this engine (no dedicated "insufficient funds" line).
export function evaluateHasMoney(params, ctx) {
  return compare(getMoney(ctx.playthroughId), params.comparison, params.value);
}
