// { chance: 0.0-1.0 }. ctx.overrideProbability (from room_template_events) takes
// precedence over the condition's own params when set (SPEC.md room_template_events).
export function evaluateProbability(params, ctx) {
  const chance = ctx.overrideProbability ?? params.chance ?? 0;
  return Math.random() < chance;
}
