import { compareNumber } from './compare.js';

// { comparison: ">="|"<="|"=="|">"|"<"|"!=", value }
export function evaluateParticipantCount(params, ctx) {
  return compareNumber(ctx.participants.length, params.comparison, params.value);
}
