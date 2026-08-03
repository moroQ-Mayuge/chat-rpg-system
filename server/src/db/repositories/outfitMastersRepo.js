import { db } from '../connection.js';
import { OUTFIT_TAG_FIELDS } from './outfitsRepo.js';

// PLAN_2026-08-02_outfit_spec_revision.md 実装順3: outfit_masters は outfits
// から character_id・画像・is_default を除いた「定義」だけを持つ共有マスタ。
// タグ列は outfitsRepo.js の OUTFIT_TAG_FIELDS をそのまま再利用する
// (master/instance で同じ列名を保つことで、後段の合成ロジックが両方を
// 同じ形として扱える)。
const MASTER_FIELDS = ['name', 'clothing_description', 'equipment_description', 'attribute_tags', ...OUTFIT_TAG_FIELDS];

function parseGarmentOperations(master) {
  if (!master) return master;
  let garment_operations;
  try {
    garment_operations = JSON.parse(master.garment_operations || '{}');
  } catch {
    garment_operations = {};
  }
  return { ...master, garment_operations };
}

// world_outfit_masters は character_statuses/world_character_statuses と同じ
// 規約: 行が無ければ共通(全Worldで使用可能)、行があればそのWorldたちに限定。
export function listMastersForWorld(worldId) {
  return db
    .prepare(
      `SELECT * FROM outfit_masters om
       WHERE NOT EXISTS (SELECT 1 FROM world_outfit_masters wom WHERE wom.outfit_master_id = om.id)
          OR EXISTS (SELECT 1 FROM world_outfit_masters wom WHERE wom.outfit_master_id = om.id AND wom.world_id = ?)
       ORDER BY name ASC`,
    )
    .all(worldId)
    .map(parseGarmentOperations);
}

export function listAllMasters() {
  return db.prepare('SELECT * FROM outfit_masters ORDER BY name ASC').all().map(parseGarmentOperations);
}

export function getMaster(id) {
  return parseGarmentOperations(db.prepare('SELECT * FROM outfit_masters WHERE id = ?').get(id));
}

export function createMaster(data) {
  const columns = MASTER_FIELDS.join(', ');
  const placeholders = MASTER_FIELDS.map(() => '?').join(', ');
  const values = MASTER_FIELDS.map((f) => data[f] ?? '');
  const result = db
    .prepare(`INSERT INTO outfit_masters (${columns}, garment_operations) VALUES (${placeholders}, ?)`)
    .run(...values, JSON.stringify(data.garment_operations ?? {}));
  return getMaster(result.lastInsertRowid);
}

export function updateMaster(id, data) {
  const setClause = MASTER_FIELDS.map((f) => `${f} = ?`).join(', ');
  const values = MASTER_FIELDS.map((f) => data[f] ?? '');
  db.prepare(`UPDATE outfit_masters SET ${setClause}, garment_operations = ? WHERE id = ?`).run(
    ...values,
    JSON.stringify(data.garment_operations ?? {}),
    id,
  );
  return getMaster(id);
}

export function deleteMaster(id) {
  db.prepare('DELETE FROM outfit_masters WHERE id = ?').run(id);
  return { deleted: true };
}

// World所属 -- characterStatusesRepo.js の listWorldsForStatus と同形。
export function listWorldsForMaster(masterId) {
  return db
    .prepare(
      `SELECT w.* FROM worlds w
       JOIN world_outfit_masters wom ON wom.world_id = w.id
       WHERE wom.outfit_master_id = ?
       ORDER BY w.name ASC`,
    )
    .all(masterId);
}

export function attachMasterToWorld(worldId, masterId) {
  db.prepare('INSERT OR IGNORE INTO world_outfit_masters (world_id, outfit_master_id) VALUES (?, ?)').run(worldId, masterId);
  return { attached: true };
}

export function detachMasterFromWorld(worldId, masterId) {
  db.prepare('DELETE FROM world_outfit_masters WHERE world_id = ? AND outfit_master_id = ?').run(worldId, masterId);
  return { detached: true };
}
