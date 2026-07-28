import { adjustMoney, setMoney } from '../../../db/repositories/playthroughsRepo.js';

// { amount, operation?: "subtract"|"add"|"set" } — operation defaults to
// "subtract", which is all this action used to do, so events written against
// the old shape keep deducting exactly as before. The paired has_money trigger
// condition (checked before this ever runs) remains where sufficient funds are
// enforced for the subtract case.
export function executeSpendMoney(params, execCtx) {
  const { amount, operation = 'subtract' } = params;
  if (operation === 'set') return { money: setMoney(execCtx.playthroughId, amount) };
  return { money: adjustMoney(execCtx.playthroughId, operation === 'add' ? amount : -amount) };
}
