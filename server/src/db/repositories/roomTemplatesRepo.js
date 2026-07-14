import { db } from '../connection.js';
import { listSlotsForRoom, replaceSlotsForRoom } from './roomParticipantSlotsRepo.js';
import { listCandidateCategoriesForRoom, replaceCandidateCategoriesForRoom } from './roomPropCategoriesRepo.js';
import { listWorldsForRoomTemplate } from './worldRoomTemplatesRepo.js';
import { listAssignmentsForWorldRoom } from './worldRoomSlotAssignmentsRepo.js';
import { listPropsForWorldRoom, listFreePropsForWorldRoom } from './worldRoomPropsRepo.js';
import { getUnassignedWorld } from './worldsRepo.js';

// Rooms are shared master data (see 0030_room_world_decoupling.sql): a room
// no longer belongs to a single World. Slots (abstract participant "枠") and
// candidate prop categories are master-level; World-specific concretization
// (who actually fills a slot, which exact props are placed, the connection
// graph) lives in getRoomTemplateForWorld / the world*Repo modules.
function attachAssociations(row) {
  if (!row) return row;
  const worldIds = listWorldsForRoomTemplate(row.id).map((w) => w.id);
  return { ...row, slots: listSlotsForRoom(row.id), candidate_prop_categories: listCandidateCategoriesForRoom(row.id), world_ids: worldIds };
}

export function listRoomTemplates() {
  const rows = db.prepare('SELECT * FROM room_templates ORDER BY name ASC').all();
  return rows.map(attachAssociations);
}

export function getRoomTemplate(id) {
  const row = db.prepare('SELECT * FROM room_templates WHERE id = ?').get(id);
  return attachAssociations(row);
}

// Combined "master fields + this World's slot assignments + this World's
// props/free props + this World's outgoing connections" view backing the
// per-World room-instance editor screen.
export function getRoomTemplateForWorld(roomTemplateId, worldId) {
  const master = getRoomTemplate(roomTemplateId);
  if (!master) return null;
  return {
    ...master,
    slot_assignments: listAssignmentsForWorldRoom(worldId, roomTemplateId),
    props: listPropsForWorldRoom(worldId, roomTemplateId),
    free_props: listFreePropsForWorldRoom(worldId, roomTemplateId),
    connections: db
      .prepare(
        `SELECT rc.*, rt.name AS to_room_name
         FROM room_connections rc
         JOIN room_templates rt ON rt.id = rc.to_room_template_id
         WHERE rc.from_room_template_id = ? AND rc.world_id = ?
         ORDER BY rc.id ASC`,
      )
      .all(roomTemplateId, worldId),
  };
}

export function createRoomTemplate(data) {
  // world_id is legacy dead weight, kept only because the column is still
  // physically present (NOT NULL) until cleanup migration
  // 0032_room_world_decoupling_cleanup.sql is applied — see
  // 0030_room_world_decoupling.sql's additive-then-cleanup two-step design.
  // Real World membership lives in world_room_templates now
  // (attachRoomToWorld); this value is never read by any app code.
  const result = db
    .prepare(
      `INSERT INTO room_templates
        (world_id, worldview_mode, name, initial_situation, location_text, location_tags,
         atmosphere_text, atmosphere_tags, worldview, background_image_path, turns_per_time_slot, attribute_tags, is_place)
       VALUES (@world_id, @worldview_mode, @name, @initial_situation, @location_text, @location_tags,
         @atmosphere_text, @atmosphere_tags, @worldview, @background_image_path, @turns_per_time_slot, @attribute_tags, @is_place)`,
    )
    .run({
      world_id: getUnassignedWorld().id,
      worldview_mode: data.worldview_mode ?? 'inherit',
      name: data.name,
      initial_situation: data.initial_situation ?? '',
      location_text: data.location_text ?? '',
      location_tags: data.location_tags ?? null,
      atmosphere_text: data.atmosphere_text ?? '',
      atmosphere_tags: data.atmosphere_tags ?? null,
      worldview: data.worldview ?? null,
      background_image_path: data.background_image_path ?? null,
      turns_per_time_slot: data.turns_per_time_slot ?? null,
      attribute_tags: data.attribute_tags ?? '',
      is_place: data.is_place ? 1 : 0,
    });
  const id = result.lastInsertRowid;
  replaceSlotsForRoom(id, data.slots);
  replaceCandidateCategoriesForRoom(id, data.prop_category_ids);
  return getRoomTemplate(id);
}

export function updateRoomTemplate(id, data) {
  db.prepare(
    `UPDATE room_templates SET
       worldview_mode = @worldview_mode, name = @name,
       initial_situation = @initial_situation, location_text = @location_text, location_tags = @location_tags,
       atmosphere_text = @atmosphere_text, atmosphere_tags = @atmosphere_tags, worldview = @worldview,
       turns_per_time_slot = @turns_per_time_slot, attribute_tags = @attribute_tags, is_place = @is_place
     WHERE id = @id`,
  ).run({
    id,
    worldview_mode: data.worldview_mode ?? 'inherit',
    name: data.name,
    initial_situation: data.initial_situation ?? '',
    location_text: data.location_text ?? '',
    location_tags: data.location_tags ?? null,
    atmosphere_text: data.atmosphere_text ?? '',
    atmosphere_tags: data.atmosphere_tags ?? null,
    worldview: data.worldview ?? null,
    turns_per_time_slot: data.turns_per_time_slot ?? null,
    attribute_tags: data.attribute_tags ?? '',
    is_place: data.is_place ? 1 : 0,
  });
  replaceSlotsForRoom(id, data.slots);
  replaceCandidateCategoriesForRoom(id, data.prop_category_ids);
  return getRoomTemplate(id);
}

export function setBackgroundImage(id, imagePath) {
  db.prepare('UPDATE room_templates SET background_image_path = ? WHERE id = ?').run(imagePath, id);
  return getRoomTemplate(id);
}

export function deleteRoomTemplate(id) {
  db.prepare('DELETE FROM room_templates WHERE id = ?').run(id);
  return { deleted: true };
}
