import { addMemory, formatOccurredLabel } from '../../../db/repositories/characterMemoriesRepo.js';
import { resolveMentionedList } from '../mentionResolution.js';

// { character_id: number|"all_present"|"mentioned"|"departed", content: string, is_pinned?, mentioned_limit? }
// Targeting mirrors setCharacterImpression.js, minus the instance hint: memory
// is route-scoped and mob characters are excluded outright (addMemory's own
// guard returns null for them), so there's no per-instance dimension to carry.
//
// "departed" means whoever character_leave removed earlier in this same event.
// They're already out of participants by the time this runs, so all_present
// can't reach them — and under random_from_present the author has no id to
// hard-code. This is how a character carries away a memory of why they left.
export async function executeAddCharacterMemory(params, execCtx) {
  const { character_id, content, is_pinned, mentioned_limit } = params;
  if (!content?.trim()) return { skipped: true, reason: 'empty_content' };

  const targetIds =
    character_id === 'all_present'
      ? execCtx.session.participants.map((p) => p.character_id)
      : character_id === 'departed'
        ? execCtx.departedCharacterIds ?? []
        : character_id === 'mentioned'
          ? resolveMentionedList(execCtx.mentionedCharacterIds, mentioned_limit)
          : [character_id];

  const occurredLabel = formatOccurredLabel(execCtx.playthroughId);
  const changes = [];
  for (const id of targetIds) {
    const memory = addMemory({
      playthrough_id: execCtx.playthroughId,
      character_id: id,
      content,
      is_pinned: Boolean(is_pinned),
      occurred_label: occurredLabel,
      source: 'event',
    });
    // null means the target was a mob (memory intentionally not kept for them).
    if (memory) changes.push({ character_id: id, memory_id: memory.id, content });
  }
  return { changes };
}
