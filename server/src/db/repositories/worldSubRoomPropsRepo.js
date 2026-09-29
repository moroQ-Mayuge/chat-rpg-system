import { db } from '../connection.js';
import { listPropsForWorldRoom, listFreePropsForWorldRoom } from './worldRoomPropsRepo.js';

// サブ部屋(0150)のWorld別小物・設備(Stage 4)。worldRoomPropsRepo.jsと同じ形の
// CRUDだが、キーがroom_template_idではなくsub_room_id。
export function listPropsForWorldSubRoom(worldId, subRoomId) {
  return db
    .prepare(
      `SELECT p.* FROM world_sub_room_props wsrp
       JOIN props p ON p.id = wsrp.prop_id
       WHERE wsrp.world_id = ? AND wsrp.sub_room_id = ?`,
    )
    .all(worldId, subRoomId);
}

export function listFreePropsForWorldSubRoom(worldId, subRoomId) {
  return db
    .prepare('SELECT id, description FROM world_sub_room_free_props WHERE world_id = ? AND sub_room_id = ?')
    .all(worldId, subRoomId);
}

export function replacePropsForWorldSubRoom(worldId, subRoomId, { propIds, freeProps }) {
  db.prepare('DELETE FROM world_sub_room_props WHERE world_id = ? AND sub_room_id = ?').run(worldId, subRoomId);
  for (const propId of propIds ?? []) {
    db.prepare('INSERT INTO world_sub_room_props (world_id, sub_room_id, prop_id) VALUES (?, ?, ?)').run(worldId, subRoomId, propId);
  }
  db.prepare('DELETE FROM world_sub_room_free_props WHERE world_id = ? AND sub_room_id = ?').run(worldId, subRoomId);
  for (const description of freeProps ?? []) {
    db.prepare('INSERT INTO world_sub_room_free_props (world_id, sub_room_id, description) VALUES (?, ?, ?)').run(
      worldId,
      subRoomId,
      description,
    );
  }
  return {
    props: listPropsForWorldSubRoom(worldId, subRoomId),
    free_props: listFreePropsForWorldSubRoom(worldId, subRoomId),
  };
}

// 実際に画像生成・@周辺で見せる小物・設備は「親部屋全体の備え付け設備＋今いる
// サブ部屋固有の追加分」の合算(プラン方針どおり、サブ部屋は親と別の場所ではなく
// 親の中の一角なので、親の備え付け設備は常に見える)。props(具体物)はidで重複を
// 除く(親・サブ部屋の両方で同じ物を選んでも画像タグが二重にならないように)。
// free_props(自由記述、画像生成には反映されない)は連結するだけ。
// subRoomIdがnull(親部屋本体にいる)なら親のみ(=従来どおりの結果)。
export function resolveEffectivePropsForRoom(worldId, roomTemplateId, subRoomId) {
  const parentProps = listPropsForWorldRoom(worldId, roomTemplateId);
  const parentFreeProps = listFreePropsForWorldRoom(worldId, roomTemplateId);
  if (subRoomId == null) return { props: parentProps, free_props: parentFreeProps };

  const subProps = listPropsForWorldSubRoom(worldId, subRoomId);
  const subFreeProps = listFreePropsForWorldSubRoom(worldId, subRoomId);
  const propsById = new Map([...parentProps, ...subProps].map((p) => [p.id, p]));
  return {
    props: [...propsById.values()],
    free_props: [...parentFreeProps, ...subFreeProps],
  };
}
