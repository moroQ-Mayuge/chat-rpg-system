import { db } from '../connection.js';

// Room-master level pool of "which characters + atmosphere/location should
// this room have today" profiles (0147). Mirrors room_template_participant_slots'
// full-replace-on-save convention exactly.
export function listProfilesForRoom(roomTemplateId) {
  return db
    .prepare('SELECT * FROM room_profiles WHERE room_template_id = ? ORDER BY sort_order ASC, id ASC')
    .all(roomTemplateId);
}

export function replaceProfilesForRoom(roomTemplateId, profiles) {
  db.prepare('DELETE FROM room_profiles WHERE room_template_id = ?').run(roomTemplateId);
  (profiles ?? []).forEach((profile, index) => {
    db.prepare(
      `INSERT INTO room_profiles
        (room_template_id, name, attribute_tags, atmosphere_text, location_text, selection_mode, weight, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      roomTemplateId,
      profile.name ?? '',
      profile.attribute_tags ?? '',
      profile.atmosphere_text ?? '',
      profile.location_text ?? '',
      profile.selection_mode ?? 'random',
      profile.weight ?? 1,
      profile.sort_order ?? index,
    );
  });
  return listProfilesForRoom(roomTemplateId);
}

function getProfile(id) {
  if (id == null) return null;
  return db.prepare('SELECT * FROM room_profiles WHERE id = ?').get(id) ?? null;
}

// Weighted random pick among this room's 'random'-mode profiles. Same plain
// cumulative-weight approach as the mob-flavor/room-slot pickers elsewhere
// in this codebase (Math.random() over a running total), not shared with
// worldRoomSlotAssignmentsRepo.js's module-private pickWeighted since that
// one is keyed on characters.event_participation_weight specifically.
function pickWeightedProfile(roomTemplateId) {
  const candidates = db
    .prepare("SELECT * FROM room_profiles WHERE room_template_id = ? AND selection_mode = 'random'")
    .all(roomTemplateId);
  if (candidates.length === 0) return null;
  const totalWeight = candidates.reduce((sum, c) => sum + Math.max(c.weight, 0), 0);
  if (totalWeight <= 0) return candidates[Math.floor(Math.random() * candidates.length)];
  let roll = Math.random() * totalWeight;
  for (const candidate of candidates) {
    roll -= Math.max(candidate.weight, 0);
    if (roll <= 0) return candidate;
  }
  return candidates[candidates.length - 1];
}

// Resolution order: event-forced override (top priority, sticks until
// cleared) > today's already-rolled auto pick (re-used, not re-rolled, while
// still the same playthroughs.current_day) > a fresh weighted-random pick
// among 'random' profiles (persisted so it stays stable for the rest of the
// day) > null (no profiles defined for this room -- every existing room
// without profiles falls straight through here, zero behavior change).
// Same "day checkpoint, lazily re-rolled on the next read that finds it
// stale" pattern as shopProducts.js's resolveLineup().
export function resolveActiveRoomProfile(playthroughId, roomTemplateId) {
  const row = db
    .prepare('SELECT * FROM playthrough_room_active_profile WHERE playthrough_id = ? AND room_template_id = ?')
    .get(playthroughId, roomTemplateId);

  if (row?.override_profile_id != null) {
    const overridden = getProfile(row.override_profile_id);
    if (overridden) return overridden;
  }

  const playthrough = db.prepare('SELECT current_day FROM playthroughs WHERE id = ?').get(playthroughId);
  if (row?.auto_profile_id != null && row.auto_generated_at_day === playthrough?.current_day) {
    const cached = getProfile(row.auto_profile_id);
    if (cached) return cached;
  }

  const picked = pickWeightedProfile(roomTemplateId);
  if (!picked) return null;

  db.prepare(
    `INSERT INTO playthrough_room_active_profile (playthrough_id, room_template_id, auto_profile_id, auto_generated_at_day)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (playthrough_id, room_template_id) DO UPDATE SET
       auto_profile_id = excluded.auto_profile_id,
       auto_generated_at_day = excluded.auto_generated_at_day`,
  ).run(playthroughId, roomTemplateId, picked.id, playthrough?.current_day ?? null);

  return picked;
}

// Resolves the {location_text, atmosphere_text} that should actually be
// snapshotted onto a room_session: the active profile's own values when
// non-empty, else the room template's own -- same empty-string-means-
// "don't override" convention as room attribute_tags falling back to the
// World's.
export function resolveRoomTextOverrides(playthroughId, roomTemplateId, template) {
  const profile = resolveActiveRoomProfile(playthroughId, roomTemplateId);
  return {
    location_text: profile?.location_text?.trim() ? profile.location_text : template.location_text,
    atmosphere_text: profile?.atmosphere_text?.trim() ? profile.atmosphere_text : template.atmosphere_text,
  };
}

export function setRoomProfileOverride(playthroughId, roomTemplateId, profileId) {
  db.prepare(
    `INSERT INTO playthrough_room_active_profile (playthrough_id, room_template_id, override_profile_id)
     VALUES (?, ?, ?)
     ON CONFLICT (playthrough_id, room_template_id) DO UPDATE SET override_profile_id = excluded.override_profile_id`,
  ).run(playthroughId, roomTemplateId, profileId);
}

export function clearRoomProfileOverride(playthroughId, roomTemplateId) {
  db.prepare(
    `UPDATE playthrough_room_active_profile SET override_profile_id = NULL
     WHERE playthrough_id = ? AND room_template_id = ?`,
  ).run(playthroughId, roomTemplateId);
}
