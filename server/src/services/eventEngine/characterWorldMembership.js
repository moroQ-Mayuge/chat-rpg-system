import { db } from '../../db/connection.js';

// event_definitions.restrict_to_own_world(0144)のための、対象キャラが
// 実際にこのプレイスルーのWorldに所属しているかの判定。タグ由来の所属
// (worldRoomSlotAssignmentsRepo.jsのlistTagDerivedWorldIdsByCharacter相当)は
// 含めない——characterJoin.jsのtag_matchモードは既にこのWorld/部屋のタグで
// 絞り込み済みで、タグ由来しか持たないキャラ(タグ経由で他Worldに流用される
// モブ等)をここでも弾くと、正当な流用まで巻き込んでしまうため。
export function resolveWorldIdForPlaythrough(playthroughId) {
  return db.prepare('SELECT world_id FROM playthroughs WHERE id = ?').get(playthroughId)?.world_id ?? null;
}

export function characterBelongsToWorld(characterId, worldId) {
  const bySlot = db
    .prepare('SELECT 1 FROM world_room_slot_assignments WHERE character_id = ? AND world_id = ? LIMIT 1')
    .get(characterId, worldId);
  if (bySlot) return true;
  const byAttach = db.prepare('SELECT 1 FROM world_characters WHERE character_id = ? AND world_id = ? LIMIT 1').get(characterId, worldId);
  return Boolean(byAttach);
}
