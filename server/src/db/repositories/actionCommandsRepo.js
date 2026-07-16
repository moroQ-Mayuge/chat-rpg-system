import { db } from '../connection.js';

// Same common (world_id IS NULL) + per-World tiering as items.
export function listActionCommandsForWorld(worldId) {
  return db
    .prepare('SELECT * FROM action_commands WHERE world_id IS NULL OR world_id = ? ORDER BY sort_order ASC, id ASC')
    .all(worldId);
}

export function listAllActionCommands() {
  return db.prepare('SELECT * FROM action_commands ORDER BY world_id IS NULL DESC, sort_order ASC, id ASC').all();
}

export function getActionCommand(id) {
  return db.prepare('SELECT * FROM action_commands WHERE id = ?').get(id);
}

export function createActionCommand({
  world_id,
  label,
  icon,
  command_type,
  keyword_text,
  sort_order,
  consumes_item,
  transfers_to_target,
  category,
  subcategory,
  sub_subcategory,
  visible_when_status_ids,
}) {
  const result = db
    .prepare(
      `INSERT INTO action_commands
        (world_id, label, icon, command_type, keyword_text, sort_order, consumes_item, transfers_to_target,
         category, subcategory, sub_subcategory, visible_when_status_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      world_id ?? null,
      label,
      icon ?? '',
      command_type,
      keyword_text ?? '',
      sort_order ?? 0,
      consumes_item ? 1 : 0,
      transfers_to_target ? 1 : 0,
      category ?? '',
      subcategory ?? '',
      sub_subcategory ?? '',
      visible_when_status_ids ?? '',
    );
  return getActionCommand(result.lastInsertRowid);
}

export function updateActionCommand(
  id,
  {
    world_id,
    label,
    icon,
    command_type,
    keyword_text,
    sort_order,
    consumes_item,
    transfers_to_target,
    category,
    subcategory,
    sub_subcategory,
    visible_when_status_ids,
  },
) {
  db.prepare(
    `UPDATE action_commands
     SET world_id = ?, label = ?, icon = ?, command_type = ?, keyword_text = ?, sort_order = ?, consumes_item = ?, transfers_to_target = ?,
         category = ?, subcategory = ?, sub_subcategory = ?, visible_when_status_ids = ?
     WHERE id = ?`,
  ).run(
    world_id ?? null,
    label,
    icon ?? '',
    command_type,
    keyword_text ?? '',
    sort_order ?? 0,
    consumes_item ? 1 : 0,
    transfers_to_target ? 1 : 0,
    category ?? '',
    subcategory ?? '',
    sub_subcategory ?? '',
    visible_when_status_ids ?? '',
    id,
  );
  return getActionCommand(id);
}

export function deleteActionCommand(id) {
  db.prepare('DELETE FROM action_commands WHERE id = ?').run(id);
  return { deleted: true };
}
