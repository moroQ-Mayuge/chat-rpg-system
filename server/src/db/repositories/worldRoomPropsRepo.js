import { db } from '../connection.js';

// World level: the actual specific prop instances placed in a room, for a
// given World's instance of it. Replaces the old room_template_props as the
// runtime source for image-generation prop tags (imagePromptBuilder.js).
export function listPropsForWorldRoom(worldId, roomTemplateId) {
  return db
    .prepare(
      `SELECT p.* FROM world_room_props wrp
       JOIN props p ON p.id = wrp.prop_id
       WHERE wrp.world_id = ? AND wrp.room_template_id = ?`,
    )
    .all(worldId, roomTemplateId);
}

export function listFreePropsForWorldRoom(worldId, roomTemplateId) {
  return db
    .prepare('SELECT id, description FROM world_room_free_props WHERE world_id = ? AND room_template_id = ?')
    .all(worldId, roomTemplateId);
}

export function replacePropsForWorldRoom(worldId, roomTemplateId, { propIds, freeProps }) {
  db.prepare('DELETE FROM world_room_props WHERE world_id = ? AND room_template_id = ?').run(worldId, roomTemplateId);
  for (const propId of propIds ?? []) {
    db.prepare('INSERT INTO world_room_props (world_id, room_template_id, prop_id) VALUES (?, ?, ?)').run(
      worldId,
      roomTemplateId,
      propId,
    );
  }
  db.prepare('DELETE FROM world_room_free_props WHERE world_id = ? AND room_template_id = ?').run(worldId, roomTemplateId);
  for (const description of freeProps ?? []) {
    db.prepare('INSERT INTO world_room_free_props (world_id, room_template_id, description) VALUES (?, ?, ?)').run(
      worldId,
      roomTemplateId,
      description,
    );
  }
  return {
    props: listPropsForWorldRoom(worldId, roomTemplateId),
    free_props: listFreePropsForWorldRoom(worldId, roomTemplateId),
  };
}
