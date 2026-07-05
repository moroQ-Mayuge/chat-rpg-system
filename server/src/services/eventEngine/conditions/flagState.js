// { flag_key, comparison: "=="|"!="|"exists"|"not_exists", value? }
// Numeric-looking flag values are compared numerically; otherwise as strings.
export function evaluateFlagState(params, ctx) {
  const { flag_key, comparison, value } = params;
  const current = ctx.flags[flag_key];
  const exists = current !== undefined;

  if (comparison === 'exists') return exists;
  if (comparison === 'not_exists') return !exists;
  if (!exists) return comparison === '!=';

  const currentNum = Number(current);
  const valueNum = Number(value);
  const numeric = !Number.isNaN(currentNum) && !Number.isNaN(valueNum);
  const equal = numeric ? currentNum === valueNum : current === value;

  return comparison === '==' ? equal : !equal;
}
