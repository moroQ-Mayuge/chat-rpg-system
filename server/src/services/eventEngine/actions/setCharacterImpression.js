import { setImpressionValue } from '../../../db/repositories/characterImpressionStatesRepo.js';
import { resolveMentionedList } from '../mentionResolution.js';

// { character_id: number|"all_present"|"mentioned", field_key: string, value: string, mentioned_limit? }
// Mirrors setAddress.js's targeting exactly.
export async function executeSetCharacterImpression(params, execCtx) {
  const { character_id, field_key, value, mentioned_limit } = params;
  const targets =
    character_id === 'all_present'
      ? execCtx.session.participants.map((p) => ({ character_id: p.character_id, instance_id: p.id }))
      : character_id === 'mentioned'
        ? resolveMentionedList(execCtx.mentionedCharacterIds, mentioned_limit).map((id) => ({
            character_id: id,
            instance_id: execCtx.instanceHintByCharacterId?.get(id),
          }))
        : [{ character_id, instance_id: execCtx.instanceHintByCharacterId?.get(character_id) }];
  const changes = targets.map(({ character_id: id, instance_id }) => ({
    character_id: id,
    ...setImpressionValue(execCtx.playthroughId, id, field_key, value, execCtx.sessionId, instance_id),
  }));
  return { changes };
}
