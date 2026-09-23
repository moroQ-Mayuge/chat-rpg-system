import { db } from '../../../db/connection.js';
import { setRoomProfileOverride, resolveRoomTextOverrides } from '../../../db/repositories/roomProfilesRepo.js';

// { room_template_id, profile_id } -- forces a specific room_profiles row
// active for this playthrough+room (0147), e.g. switching an event venue
// into a "battle field" profile. Takes priority over the daily auto-rolled
// pick until clear_room_profile is called. Only re-snapshots the CURRENT
// session's atmosphere/location text if this event's own session happens to
// be sitting in the target room right now -- actually bringing characters
// matching the new profile's tags into the room is the author's job via an
// ordinary character_join(tag_match) action in the same event, since those
// resolve context tags live (see worldRoomSlotAssignmentsRepo.js/
// characterJoin.js's getContextTags), unlike this snapshotted text.
export async function executeSetRoomProfile(params, execCtx) {
  const { room_template_id, profile_id } = params;
  if (room_template_id == null || profile_id == null) return { skipped: true, reason: 'missing_params' };

  setRoomProfileOverride(execCtx.playthroughId, room_template_id, profile_id);

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

  return { room_template_id, profile_id };
}
