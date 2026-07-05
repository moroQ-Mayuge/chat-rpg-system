// { comparison: ">="|"<="|"==", value }
export function evaluateParticipantCount(params, ctx) {
  const count = ctx.participants.length;
  const { comparison, value } = params;
  if (comparison === '>=') return count >= value;
  if (comparison === '<=') return count <= value;
  if (comparison === '==') return count === value;
  return false;
}
