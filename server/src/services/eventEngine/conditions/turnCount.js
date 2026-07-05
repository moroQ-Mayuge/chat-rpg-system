import { getLastFireTurn } from '../../../db/repositories/eventFireHistoryRepo.js';

function compare(elapsed, comparison, turns) {
  if (comparison === '>=') return elapsed >= turns;
  if (comparison === '==') return elapsed === turns;
  if (comparison === '>') return elapsed > turns;
  return false;
}

// { reference: "playthrough_start" | "flag_set" | "last_fire_of_this_event", comparison, turns, flag_key? }
export function evaluateTurnCount(params, ctx) {
  const { reference, comparison, turns } = params;

  if (reference === 'playthrough_start') {
    return compare(ctx.turnNumber, comparison, turns);
  }

  if (reference === 'flag_set') {
    const flagTurn = ctx.flagSetAtTurn?.(params.flag_key);
    if (flagTurn == null) return false;
    return compare(ctx.turnNumber - flagTurn, comparison, turns);
  }

  if (reference === 'last_fire_of_this_event') {
    const lastFire = getLastFireTurn(ctx.playthroughId, ctx.eventDefinitionId);
    if (lastFire == null) return true; // never fired -> treat as "infinite turns elapsed"
    return compare(ctx.turnNumber - lastFire, comparison, turns);
  }

  return false;
}
