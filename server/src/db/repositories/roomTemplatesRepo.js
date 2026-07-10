import { db } from '../connection.js';
import { getUnassignedWorld } from './worldsRepo.js';

function attachAssociations(row) {
  if (!row) return row;
  const propIds = db
    .prepare('SELECT prop_id FROM room_template_props WHERE room_template_id = ?')
    .all(row.id)
    .map((r) => r.prop_id);
  const freeProps = db
    .prepare('SELECT id, description FROM room_template_free_props WHERE room_template_id = ?')
    .all(row.id);
  const characterIds = db
    .prepare('SELECT character_id FROM room_template_characters WHERE room_template_id = ? AND is_default_participant = 1')
    .all(row.id)
    .map((r) => r.character_id);
  return { ...row, prop_ids: propIds, free_props: freeProps, character_ids: characterIds };
}

export function listRoomTemplates() {
  const rows = db
    .prepare(
      `SELECT rt.*, w.name AS world_name, w.is_unassigned_bucket AS world_is_unassigned_bucket, w.attribute_tags AS world_attribute_tags
       FROM room_templates rt
       JOIN worlds w ON w.id = rt.world_id
       ORDER BY w.is_unassigned_bucket ASC, w.name ASC, rt.name ASC`,
    )
    .all();
  return rows.map(attachAssociations);
}

export function getRoomTemplate(id) {
  const row = db
    .prepare(
      `SELECT rt.*, w.attribute_tags AS world_attribute_tags
       FROM room_templates rt
       JOIN worlds w ON w.id = rt.world_id
       WHERE rt.id = ?`,
    )
    .get(id);
  return attachAssociations(row);
}

function replaceAssociations(roomTemplateId, { prop_ids, free_props, character_ids }) {
  db.prepare('DELETE FROM room_template_props WHERE room_template_id = ?').run(roomTemplateId);
  for (const propId of prop_ids ?? []) {
    db.prepare('INSERT INTO room_template_props (room_template_id, prop_id) VALUES (?, ?)').run(roomTemplateId, propId);
  }
  db.prepare('DELETE FROM room_template_free_props WHERE room_template_id = ?').run(roomTemplateId);
  for (const description of free_props ?? []) {
    db.prepare('INSERT INTO room_template_free_props (room_template_id, description) VALUES (?, ?)').run(
      roomTemplateId,
      description,
    );
  }
  db.prepare('DELETE FROM room_template_characters WHERE room_template_id = ?').run(roomTemplateId);
  for (const characterId of character_ids ?? []) {
    db.prepare(
      'INSERT INTO room_template_characters (room_template_id, character_id, is_default_participant) VALUES (?, ?, 1)',
    ).run(roomTemplateId, characterId);
  }
}

export function createRoomTemplate(data) {
  const worldId = data.world_id ?? getUnassignedWorld().id;
  const result = db
    .prepare(
      `INSERT INTO room_templates
        (world_id, worldview_mode, name, initial_situation, location_text, location_tags,
         atmosphere_text, atmosphere_tags, worldview, background_image_path, turns_per_time_slot, attribute_tags, is_place)
       VALUES (@world_id, @worldview_mode, @name, @initial_situation, @location_text, @location_tags,
         @atmosphere_text, @atmosphere_tags, @worldview, @background_image_path, @turns_per_time_slot, @attribute_tags, @is_place)`,
    )
    .run({
      world_id: worldId,
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
  replaceAssociations(result.lastInsertRowid, data);
  return getRoomTemplate(result.lastInsertRowid);
}

export function updateRoomTemplate(id, data) {
  const worldId = data.world_id ?? getUnassignedWorld().id;
  db.prepare(
    `UPDATE room_templates SET
       world_id = @world_id, worldview_mode = @worldview_mode, name = @name,
       initial_situation = @initial_situation, location_text = @location_text, location_tags = @location_tags,
       atmosphere_text = @atmosphere_text, atmosphere_tags = @atmosphere_tags, worldview = @worldview,
       turns_per_time_slot = @turns_per_time_slot, attribute_tags = @attribute_tags, is_place = @is_place
     WHERE id = @id`,
  ).run({
    id,
    world_id: worldId,
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
  replaceAssociations(id, data);
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
