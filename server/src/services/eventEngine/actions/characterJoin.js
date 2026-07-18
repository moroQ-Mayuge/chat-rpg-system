import { db } from '../../../db/connection.js';
import { addParticipant } from '../../../db/repositories/roomSessionsRepo.js';
import { createMessage } from '../../../db/repositories/messagesRepo.js';
import { broadcast } from '../../../ws/rooms.js';
import { parseAttributeTags, tagsOverlapOrWildcard } from '../../attributeTagMatching.js';
import { resolveMentionedSingle } from '../mentionResolution.js';

function pickWeighted(candidateIds) {
  const weights = candidateIds.map(
    (id) => db.prepare('SELECT event_participation_weight FROM characters WHERE id = ?').get(id)?.event_participation_weight ?? 1,
  );
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < candidateIds.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return candidateIds[i];
  }
  return candidateIds[candidateIds.length - 1];
}

// The current room template's attribute_tags plus its World's — the shared
// "eligible here" tag set used both for tag_match candidate selection and
// for the require_attribute_match guard below. The room's World is resolved
// from the playthrough, not the room itself, since rooms are shared master
// data now and no longer carry a single world_id (0030_room_world_decoupling.sql).
function getContextTags(roomTemplateId, playthroughId) {
  const template = db.prepare('SELECT attribute_tags FROM room_templates WHERE id = ?').get(roomTemplateId);
  if (!template) return [];
  const worldId = db.prepare('SELECT world_id FROM playthroughs WHERE id = ?').get(playthroughId)?.world_id;
  const world = worldId ? db.prepare('SELECT attribute_tags FROM worlds WHERE id = ?').get(worldId) : null;
  return [...parseAttributeTags(template.attribute_tags), ...parseAttributeTags(world?.attribute_tags)];
}

// Candidates whose own attribute_tags overlap with the context tags (chat
// enhancement backlog item 23): lets a character be authored once with keys
// like "学生"/"幼馴染" and automatically become eligible everywhere those
// keys are declared, instead of hand-listing candidate_character_ids per
// event.
function tagMatchCandidates(roomTemplateId, playthroughId) {
  const contextTags = getContextTags(roomTemplateId, playthroughId);
  if (contextTags.length === 0) return [];

  return db
    .prepare('SELECT id, attribute_tags FROM characters')
    .all()
    .filter((c) => tagsOverlapOrWildcard(parseAttributeTags(c.attribute_tags), contextTags))
    .map((c) => c.id);
}

const DEFAULT_REJECTION_NARRATION = '{character_name}は、この場にふさわしくないようで姿を見せなかった。';

// { selection_mode: "specific"|"random_weighted"|"random_uniform"|"tag_match", character_id?: number|"mentioned", candidate_character_ids?, outfit_id?, entrance_narration?, require_attribute_match?, rejection_narration? }
export async function executeCharacterJoin(params, execCtx) {
  const { selection_mode, character_id, candidate_character_ids = [], outfit_id = null, entrance_narration } = params;
  const presentIds = new Set(execCtx.session.participants.map((p) => p.character_id));

  let targetId;
  if (selection_mode === 'specific') {
    targetId = character_id === 'mentioned' ? resolveMentionedSingle(execCtx.mentionedCharacterIds) : character_id;
    if (targetId == null) return { skipped: true, reason: 'no_mention' };

    // Guard against a "summon"-style event naming a fixed character who
    // doesn't actually belong here (chat enhancement backlog item 23
    // follow-up): whatever triggered this action — an authored keyword
    // condition, a player's free action, an @mention — resolves to the same
    // executeCharacterJoin() call, so gating it here covers all of those
    // trigger paths at once. Only enforced when the room/World actually
    // declares attribute tags; untagged rooms are left unrestricted.
    if (params.require_attribute_match) {
      const contextTags = getContextTags(execCtx.roomTemplateId, execCtx.playthroughId);
      if (contextTags.length > 0) {
        const target = db.prepare('SELECT name, attribute_tags FROM characters WHERE id = ?').get(targetId);
        const matches = target && tagsOverlapOrWildcard(parseAttributeTags(target.attribute_tags), contextTags);
        if (!matches) {
          const rejectionText = (params.rejection_narration || DEFAULT_REJECTION_NARRATION).replaceAll(
            '{character_name}',
            target?.name ?? '???',
          );
          const message = createMessage(execCtx.sessionId, { sender_type: 'narration', content: rejectionText });
          broadcast(execCtx.sessionId, { type: 'message_complete', message });
          return { skipped: true, reason: 'attribute_mismatch' };
        }
      }
    }
  } else if (selection_mode === 'tag_match') {
    const pool = tagMatchCandidates(execCtx.roomTemplateId, execCtx.playthroughId).filter((id) => !presentIds.has(id));
    if (pool.length === 0) return { skipped: true, reason: 'no_eligible_candidates' };
    targetId = pickWeighted(pool);
  } else {
    const pool = candidate_character_ids.filter((id) => !presentIds.has(id));
    if (pool.length === 0) return { skipped: true, reason: 'no_eligible_candidates' };
    targetId = selection_mode === 'random_weighted' ? pickWeighted(pool) : pool[Math.floor(Math.random() * pool.length)];
  }

  if (presentIds.has(targetId)) return { skipped: true, reason: 'already_present' };

  addParticipant(execCtx.sessionId, targetId, outfit_id);
  broadcast(execCtx.sessionId, { type: 'participants_changed' });

  if (entrance_narration) {
    const name = db.prepare('SELECT name FROM characters WHERE id = ?').get(targetId)?.name ?? '???';
    const message = createMessage(execCtx.sessionId, {
      sender_type: 'narration',
      content: entrance_narration.replaceAll('{character_name}', name),
    });
    broadcast(execCtx.sessionId, { type: 'message_complete', message });
  }

  return { joined: targetId };
}
