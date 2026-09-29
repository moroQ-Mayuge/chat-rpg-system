import { db } from '../connection.js';
import { resolveRoomTextOverrides } from './roomProfilesRepo.js';
import { listCandidateCategoriesForSubRoom, replaceCandidateCategoriesForSubRoom } from './roomItemCategoriesRepo.js';

// 親部屋にぶら下がる「サブ部屋」(0150)のマスタ層。room_profilesと同じく
// 部屋マスタの保存(PUT /room-templates/:id)に相乗りする子リストだが、
// room_sessions.sub_room_idから参照されるため、全置換ではなく「idがあれば
// UPDATE、無ければINSERT、送られてこなかった既存行はDELETE」で同期する
// (管理画面の保存のたびに進行中セッションの位置がNULLへ飛ばないように)。
//
// item_category_ids は room_templates.candidate_item_categories(オブジェクト配列)
// と違いid配列で直接返す——サブ部屋は部屋本体ほど他画面から参照されない子データ
// なので、クライアント側でのid抽出の手間を省く簡略形にした。
function attachItemCategoryIds(row) {
  if (!row) return row;
  return { ...row, item_category_ids: listCandidateCategoriesForSubRoom(row.id).map((c) => c.id) };
}

export function listSubRoomsForRoom(roomTemplateId) {
  return db
    .prepare('SELECT * FROM room_sub_rooms WHERE room_template_id = ? ORDER BY sort_order ASC, id ASC')
    .all(roomTemplateId)
    .map(attachItemCategoryIds);
}

export function getSubRoom(id) {
  if (id == null) return null;
  return attachItemCategoryIds(db.prepare('SELECT * FROM room_sub_rooms WHERE id = ?').get(id) ?? null);
}

export function getDefaultSubRoom(roomTemplateId) {
  const row =
    db
      .prepare('SELECT * FROM room_sub_rooms WHERE room_template_id = ? AND is_default = 1 ORDER BY sort_order ASC, id ASC')
      .get(roomTemplateId) ?? null;
  return attachItemCategoryIds(row);
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// サブ部屋が削除される時、そのidを番兵として使っている探索・品揃えキャッシュ
// (0153、sub_room_id NOT NULL DEFAULT 0で番兵運用のためFK CASCADEが効かない)を
// 明示的に片付ける——他のプリセット系リポジトリ(mobFlavorPresetsRepo等)と同じ
// 「FKが張れない参照は削除前に自分で掃除する」規約。
function cleanupCommerceCacheForSubRoom(subRoomId) {
  db.prepare('DELETE FROM playthrough_room_discoveries WHERE sub_room_id = ?').run(subRoomId);
  db.prepare('DELETE FROM playthrough_room_available_items WHERE sub_room_id = ?').run(subRoomId);
  db.prepare('DELETE FROM playthrough_shop_lineups WHERE sub_room_id = ?').run(subRoomId);
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
      // 商取引の上書き(Stage 3)。NULL/空文字=親を継承。
      is_shop: sub.is_shop == null ? null : sub.is_shop ? 1 : 0,
      outfit_acquisition_mode: sub.outfit_acquisition_mode || null,
      outfit_attribute_tags: sub.outfit_attribute_tags || null,
      shop_lineup_min: sub.shop_lineup_min === '' || sub.shop_lineup_min == null ? null : Number(sub.shop_lineup_min),
      shop_lineup_max: sub.shop_lineup_max === '' || sub.shop_lineup_max == null ? null : Number(sub.shop_lineup_max),
      shop_lineup_refresh_unit: sub.shop_lineup_refresh_unit || null,
      shop_lineup_refresh_interval:
        sub.shop_lineup_refresh_interval === '' || sub.shop_lineup_refresh_interval == null
          ? null
          : Number(sub.shop_lineup_refresh_interval),
    };
    let subRoomId;
    if (sub.id != null && existingIds.has(sub.id)) {
      db.prepare(
        `UPDATE room_sub_rooms SET name = @name, sort_order = @sort_order, is_default = @is_default,
           location_text = @location_text, atmosphere_text = @atmosphere_text,
           location_tags = @location_tags, atmosphere_tags = @atmosphere_tags,
           background_image_path = @background_image_path, enter_movement_cost = @enter_movement_cost,
           is_shop = @is_shop, outfit_acquisition_mode = @outfit_acquisition_mode,
           outfit_attribute_tags = @outfit_attribute_tags, shop_lineup_min = @shop_lineup_min,
           shop_lineup_max = @shop_lineup_max, shop_lineup_refresh_unit = @shop_lineup_refresh_unit,
           shop_lineup_refresh_interval = @shop_lineup_refresh_interval
         WHERE id = @id`,
      ).run({ ...values, id: sub.id });
      subRoomId = sub.id;
    } else {
      const result = db
        .prepare(
          `INSERT INTO room_sub_rooms
            (room_template_id, name, sort_order, is_default, location_text, atmosphere_text,
             location_tags, atmosphere_tags, background_image_path, enter_movement_cost,
             is_shop, outfit_acquisition_mode, outfit_attribute_tags, shop_lineup_min, shop_lineup_max,
             shop_lineup_refresh_unit, shop_lineup_refresh_interval)
           VALUES (@room_template_id, @name, @sort_order, @is_default, @location_text, @atmosphere_text,
             @location_tags, @atmosphere_tags, @background_image_path, @enter_movement_cost,
             @is_shop, @outfit_acquisition_mode, @outfit_attribute_tags, @shop_lineup_min, @shop_lineup_max,
             @shop_lineup_refresh_unit, @shop_lineup_refresh_interval)`,
        )
        .run({ ...values, room_template_id: roomTemplateId });
      subRoomId = Number(result.lastInsertRowid);
    }
    keepIds.add(subRoomId);
    replaceCandidateCategoriesForSubRoom(subRoomId, sub.item_category_ids);
  });

  for (const id of existingIds) {
    if (!keepIds.has(id)) {
      cleanupCommerceCacheForSubRoom(id);
      db.prepare('DELETE FROM room_sub_rooms WHERE id = ?').run(id);
    }
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

// 商取引まわり(is_shop・衣装入手モード・品揃え設定、Stage 3)の実効値。各項目
// 独立にNULL(is_shop)/空文字(タグ)=継承——「この店だけ衣装は売らない」のように
// 一部の項目だけ上書きできるようにするため、min/maxのようなペアも連動させない。
export function resolveEffectiveCommerce(template, subRoom = null) {
  return {
    is_shop: subRoom?.is_shop != null ? Boolean(subRoom.is_shop) : Boolean(template.is_shop),
    outfit_acquisition_mode: subRoom?.outfit_acquisition_mode || template.outfit_acquisition_mode,
    outfit_attribute_tags: nonBlank(subRoom?.outfit_attribute_tags) ? subRoom.outfit_attribute_tags : template.outfit_attribute_tags,
    shop_lineup_min: subRoom?.shop_lineup_min ?? template.shop_lineup_min,
    shop_lineup_max: subRoom?.shop_lineup_max ?? template.shop_lineup_max,
    shop_lineup_refresh_unit: subRoom?.shop_lineup_refresh_unit || template.shop_lineup_refresh_unit,
    shop_lineup_refresh_interval: subRoom?.shop_lineup_refresh_interval ?? template.shop_lineup_refresh_interval,
  };
}
