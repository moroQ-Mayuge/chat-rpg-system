import { db } from '../../db/connection.js';
import { listEventDefinitions } from '../../db/repositories/eventDefinitionsRepo.js';
import { listStatusesForWorld } from '../../db/repositories/characterStatusesRepo.js';

// インポート時の「同名が既にある」判断。
//
// 取り込み前に detectBundleConflicts で同名の既存データを洗い出し(プレビュー)、
// 利用者が1件ごとに選んだ decisions を importBundle へ渡す。種別ごとの取り込み関数は
// plan.resolve() で「新規作成/上書き/別名で新規/スキップ」のどれかを受け取る。
// decisions に無い(=判断が渡されない)同名は従来どおり何もせず新規作成する
// (APIを直接叩く既存の呼び出し元や、ルート固有キャラ等の取り込みを変えないため)。

export const IMPORT_SUFFIX = '（インポート）';

export const CONFLICT_KIND_LABELS = {
  world: 'World',
  room_template: '部屋',
  character: 'キャラクター',
  character_status: 'キャラ状態',
  event_definition: 'イベント',
  outfit_master: '衣装マスタ',
};

export function conflictKey(kind, name) {
  return `${kind}:${name}`;
}

export function renamedForImport(name) {
  return `${name}${IMPORT_SUFFIX}`;
}

// 'create'(同名なし/判断なし) | 'overwrite' | 'rename'(別名で新規) | 'skip'
export function createImportPlan(decisions = {}) {
  const updated = {};
  const skipped = {};
  const push = (bucket, kind, name) => {
    (bucket[kind] ??= []).push(name);
  };
  return {
    // 衣装マスタは取り込み順の都合でキャラより先に作られる。キャラ側の衣装が
    // 「別名で新規」にしたマスタを正しく指せるよう、元の名前→実idをここに残す。
    outfitMasterIdByName: new Map(),
    updated,
    skipped,
    resolve(kind, name, existing) {
      if (!existing) return { action: 'create', existing: null };
      const decision = decisions[conflictKey(kind, name)];
      if (decision === 'overwrite') {
        push(updated, kind, name);
        return { action: 'overwrite', existing };
      }
      if (decision === 'skip') {
        push(skipped, kind, name);
        return { action: 'skip', existing };
      }
      if (decision === 'new') return { action: 'rename', existing };
      return { action: 'create', existing };
    },
  };
}

// ---- 既存データの検索(同名の判定基準は種別ごとに異なる) ----

export function findExistingWorld(name) {
  return db.prepare('SELECT id, name FROM worlds WHERE name = ? AND is_unassigned_bucket = 0 ORDER BY id ASC LIMIT 1').get(name) ?? null;
}

// 部屋はWorldをまたいで同名になりうる(「自分の部屋」等、別Worldの別の部屋)ので、取り込み先
// (contextWorldId)に紐付いている部屋を優先する。どれも紐付いていなければ最小idの1件。
export function findExistingRoomTemplate(name, contextWorldId = null) {
  const rows = db.prepare('SELECT id, name FROM room_templates WHERE name = ? ORDER BY id ASC').all(name);
  if (rows.length <= 1 || contextWorldId == null) return rows[0] ?? null;
  const attached = new Set(
    db.prepare('SELECT room_template_id FROM world_room_templates WHERE world_id = ?').all(contextWorldId).map((r) => r.room_template_id),
  );
  return rows.find((r) => attached.has(r.id)) ?? rows[0];
}

// ルート固有キャラ(子・モブ昇格など)は特定のプレイの産物で、配布物と同名でも別物。
// 同名のキャラが複数いる場合は、取り込み先Worldに所属している(明示紐付け・部屋の枠への割り当て)方を優先する。
export function findExistingCharacter(name, contextWorldId = null) {
  const rows = db
    .prepare('SELECT id, name FROM characters WHERE name = ? AND is_auto_created = 0 AND origin_playthrough_id IS NULL ORDER BY id ASC')
    .all(name);
  if (rows.length <= 1 || contextWorldId == null) return rows[0] ?? null;
  const members = new Set([
    ...db.prepare('SELECT character_id FROM world_characters WHERE world_id = ?').all(contextWorldId).map((r) => r.character_id),
    ...db
      .prepare('SELECT DISTINCT character_id FROM world_room_slot_assignments WHERE world_id = ? AND character_id IS NOT NULL')
      .all(contextWorldId)
      .map((r) => r.character_id),
  ]);
  return rows.find((r) => members.has(r.id)) ?? rows[0];
}

// 状態は「全World共通」か「そのWorld限定」の共有マスタ。取り込み先Worldから見える
// ものだけを同名の対象にする(別Worldに限定された同名の状態は別物)。
// 取り込み先Worldがまだ無い(新規作成される)場合は比較対象が無いので同名なし扱い。
export function findExistingStatus(name, worldId) {
  if (worldId == null) return null;
  return listStatusesForWorld(worldId).find((s) => s.name === name) ?? null;
}

export function findExistingOutfitMaster(name) {
  return db.prepare('SELECT id, name FROM outfit_masters WHERE name = ? ORDER BY id ASC LIMIT 1').get(name) ?? null;
}

// イベント名はWorldをまたいで普通に重複する(同じ「告白」等)ので、名前だけでなく
// 適用範囲(全体/部屋限定)と、部屋限定なら部屋名も同じものだけを同名とみなす。
export function findExistingEventDefinition(json) {
  const name = json?.data?.name;
  if (!name) return null;
  const scope = json.data.scope ?? 'global';
  return (
    listEventDefinitions().find((d) => {
      if (d.name !== name || d.scope !== scope) return false;
      if (scope !== 'room_template') return true;
      const room = db.prepare('SELECT name FROM room_templates WHERE id = ?').get(d.room_template_id);
      return (room?.name ?? null) === (json.room_template_name ?? null);
    }) ?? null
  );
}

// プレビュー用: このバンドルを取り込んだ時に同名と衝突するものの一覧。
// 取り込み先Worldは「バンドルのWorldと同名の既存World → 無ければ target_world_id」で
// 推定する(取り込みの実処理と同じ決め方。Worldを「別名で新規」にした場合は
// 状態の衝突が実際には起きないが、その場合は取り込み側が新規作成に倒す)。
export function detectBundleConflicts(manifest, { targetWorldId = null } = {}) {
  const conflicts = [];
  const seen = new Set();
  const add = (kind, name, existing, extra = {}) => {
    if (!existing || !name) return;
    const key = conflictKey(kind, name);
    if (seen.has(key)) return;
    seen.add(key);
    conflicts.push({ kind, kind_label: CONFLICT_KIND_LABELS[kind], name, existing_id: existing.id, ...extra });
  };

  // 同名判定の文脈になるWorld: バンドルのWorldと同名の既存World、無ければ取り込み先指定。
  let contextWorldId = targetWorldId;
  for (const entry of manifest.worlds ?? []) {
    const existing = findExistingWorld(entry.name);
    add('world', entry.name, existing);
  }
  const bundleWorldName = manifest.worlds?.[0]?.name;
  if (bundleWorldName) contextWorldId = findExistingWorld(bundleWorldName)?.id ?? null;

  for (const entry of manifest.outfit_masters ?? []) add('outfit_master', entry.name, findExistingOutfitMaster(entry.name));
  for (const entry of manifest.room_templates ?? []) add('room_template', entry.name, findExistingRoomTemplate(entry.name, contextWorldId));
  for (const entry of manifest.characters ?? []) add('character', entry.name, findExistingCharacter(entry.name, contextWorldId));
  for (const entry of manifest.character_statuses ?? []) {
    add('character_status', entry.name, findExistingStatus(entry.name, contextWorldId));
  }
  for (const json of manifest.event_definitions ?? []) {
    const existing = findExistingEventDefinition(json);
    add('event_definition', json.data?.name, existing, json.data?.scope === 'room_template' && json.room_template_name ? { detail: `部屋: ${json.room_template_name}` } : {});
  }
  return conflicts;
}
