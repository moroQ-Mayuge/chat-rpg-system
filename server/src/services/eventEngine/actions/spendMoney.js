import { adjustMoney } from '../../../db/repositories/playthroughsRepo.js';

// { amount } — deducts a flat amount from playthroughs.money. Paired with
// the has_money trigger condition (checked before this action ever runs),
// so no re-check for sufficient funds happens here.
export function executeSpendMoney(params, execCtx) {
  const money = adjustMoney(execCtx.playthroughId, -params.amount);
  return { money };
}
