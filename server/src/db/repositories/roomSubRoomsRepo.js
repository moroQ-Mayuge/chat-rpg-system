import { db } from '../connection.js';
import { resolveRoomTextOverrides } from './roomProfilesRepo.js';

// 親部屋にぶら下がる「サブ部屋」(0150)のマスタ層。room_profilesと同じく
// 部屋マスタの保存(PUT /room-templates/:id)に相乗りする子リストだが、
// room_sessions.sub_room_idから参照されるため、全置換ではなく「idがあれば
// UPDATE、無ければINSERT、送られてこなかった既存行はDELETE」で同期する
// (管理画面の保存のたびに進行中セッションの位置がNULLへ飛ばないように)。
export function listSubRoomsForRoom(roomTemplateId) {
  return db
    .prepare('SELECT * FROM room_sub_rooms WHERE room_template_id = ? ORDER BY sort_order ASC, id ASC')
    .all(roomTemplateId);
}

export function getSubRoom(id) {
  if (id == null) return null;
  return db.prepare('SELECT * FROM room_sub_rooms WHERE id = ?').get(id) ?? null;
}

export function getDefaultSubRoom(roomTemplateId) {
  return (
    db
      .prepare('SELECT * FROM room_sub_rooms WHERE room_template_id = ? AND is_default = 1 ORDER BY sort_order ASC, id ASC')
      .get(roomTemplateId) ?? null
  );
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim() !== '';
}

export function syncSubRoomsForRoom(roomTemplateId, subRooms) {
  const incoming = subRooms ?? [];
  const existingIds = new Set(listSubRoomsForRoom(roomTemplateId).map((s) => s.id));
  const keepIds = new Set();
  let defaultTaken = false;

  incoming.forEach((sub, index) => {
    // 既定は先頭の1件だけ有効(親に高々1件)。
    const isDefault = sub.is_default && !defaultTaken ? 1 : 0;
    if (isDefault) defaultTaken = true;
    const values = {
      name: sub.name ?? '',
      sort_order: index,
      is_default: isDefault,
      location_text: sub.location_text ?? '',
      atmosphere_text: sub.atmosphere_text ?? '',
      location_tags: sub.location_tags || null,
      atmosphere_tags: sub.atmosphere_tags || null,
      background_image_path: sub.background_image_path || null,
      enter_movement_cost: Math.max(0, Number.parseInt(sub.enter_movement_cost ?? 0, 10) || 0),
    };
    if (sub.id != null && existingIds.has(sub.id)) {
      db.prepare(
        `UPDATE room_sub_rooms SET name = @name, sort_order = @sort_order, is_default = @is_default,
           location_text = @location_text, atmosphere_text = @atmosphere_text,
           location_tags = @location_tags, atmosphere_tags = @atmosphere_tags,
           background_image_path = @background_image_path, enter_movement_cost = @enter_movement_cost
         WHERE id = @id`,
      ).run({ ...values, id: sub.id });
      keepIds.add(sub.id);
    } else {
      const result = db
        .prepare(
          `INSERT INTO room_sub_rooms
            (room_template_id, name, sort_order, is_default, location_text, atmosphere_text,
             location_tags, atmosphere_tags, background_image_path, enter_movement_cost)
           VALUES (@room_template_id, @name, @sort_order, @is_default, @location_text, @atmosphere_text,
             @location_tags, @atmosphere_tags, @background_image_path, @enter_movement_cost)`,
        )
        .run({ ...values, room_template_id: roomTemplateId });
      keepIds.add(Number(result.lastInsertRowid));
    }
  });

  for (const id of existingIds) {
    if (!keepIds.has(id)) db.prepare('DELETE FROM room_sub_rooms WHERE id = ?').run(id);
  }
  return listSubRoomsForRoom(roomTemplateId);
}

// セッションへスナップショットする場所/雰囲気(テキスト+タグ)を解決する。
// 優先順位: サブ部屋の非空値 > アクティブなroom_profile > 親テンプレート。
// promptBuilder.js/imagePromptBuilder.jsはこのスナップショット(current_*)しか
// 見ないので、createRoomSession/switchRoomWithinSession/switchSubRoomの全てが
// ここを通ることで、機能ごとの個別分岐を避ける。subRoomがnullなら従来どおり
// (profile>親)と完全に同じ結果になる。
export function resolveRoomSnapshot(playthroughId, roomTemplateId, template, subRoom = null) {
  const base = resolveRoomTextOverrides(playthroughId, roomTemplateId, template);
  return {
    location_text: nonBlank(subRoom?.location_text) ? subRoom.location_text : base.location_text,
    atmosphere_text: nonBlank(subRoom?.atmosphere_text) ? subRoom.atmosphere_text : base.atmosphere_text,
    location_tags: nonBlank(subRoom?.location_tags) ? subRoom.location_tags : template.location_tags,
    atmosphere_tags: nonBlank(subRoom?.atmosphere_tags) ? subRoom.atmosphere_tags : template.atmosphere_tags,
  };
}
