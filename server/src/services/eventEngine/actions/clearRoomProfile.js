import { db } from '../../../db/connection.js';
import { clearRoomProfileOverride, resolveRoomTextOverrides } from '../../../db/repositories/roomProfilesRepo.js';

// { room_template_id } -- removes an event-forced room profile override
// (0147), reverting to today's auto-rolled pick (or the room's own static
// attribute_tags/atmosphere if this room has no 'random' profiles). Mirrors
// setRoomProfile.js's session re-snapshot behavior.
export async function executeClearRoomProfile(params, execCtx) {
  const { room_template_id } = params;
  if (room_template_id == null) return { skipped: true, reason: 'missing_params' };

  clearRoomProfileOverride(execCtx.playthroughId, room_template_id);

  if (execCtx.session?.room_template_id === room_template_id) {
    const template = db.prepare('SELECT * FROM room_templates WHERE id = ?').get(room_template_id);
    if (template) {
      const textOverrides = resolveRoomTextOverrides(execCtx.playthroughId, room_template_id, template);
      db.prepare('UPDATE room_sessions SET current_location_text = ?, current_atmosphere_text = ? WHERE id = ?').run(
        textOverrides.location_text,
        textOverrides.atmosphere_text,
        execCtx.sessionId,
      );
    }
  }

  return { room_template_id, cleared: true };
}
