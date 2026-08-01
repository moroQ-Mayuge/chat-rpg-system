import { setImpressionValue } from '../../../db/repositories/characterImpressionStatesRepo.js';
import { resolveTargetIds } from '../targetResolution.js';

// { character_id: number|"all_present"|"mentioned"|"condition_matched", field_key: string, value: string, mentioned_limit? }
// Mirrors setAddress.js's targeting exactly.
export async function executeSetCharacterImpression(params, execCtx) {
  const { character_id, field_key, value, mentioned_limit } = params;
  const targets =
    character_id === 'all_present'
      ? execCtx.session.participants.map((p) => ({ character_id: p.character_id, instance_id: p.id }))
      : resolveTargetIds(character_id, mentioned_limit, execCtx).map((id) => ({
          character_id: id,
          instance_id: execCtx.instanceHintByCharacterId?.get(id),
        }));
  const changes = targets.map(({ character_id: id, instance_id }) => ({
    character_id: id,
    ...setImpressionValue(execCtx.playthroughId, id, field_key, value, execCtx.sessionId, instance_id),
  }));
  return { changes };
}
