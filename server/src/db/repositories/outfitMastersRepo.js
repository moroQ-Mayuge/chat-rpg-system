import { db } from '../connection.js';
import { OUTFIT_TAG_FIELDS, createOutfit, updateOutfit, getOutfit } from './outfitsRepo.js';

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

// OUTFIT_GRANTタグの名前解決用。衣装マスタは名前だけで一意に解決する厳選プリセット
// (LLMが即興で作れる対象ではない)。
export function getMasterByName(name) {
  return parseGarmentOperations(db.prepare('SELECT * FROM outfit_masters WHERE name = ?').get(name));
}

// 全角(（）)・半角(())の丸括弧は同じ意味で使われるが別文字なので、正規化して
// 比較しないと「メイド服（クラシック/ミニスカート）」(全角で書き間違えた)が
// 一致しなくなる。中身は落とさず括弧の幅だけ揃える —— 中身ごと落とすと
// 「メイド服」と「メイド服(クラシック/ミニスカート)」という**別価格の別商品**が
// 同じ文字列に潰れて衝突してしまうため。
function normalizeParens(name) {
  return (name || '').replace(/（/g, '(').replace(/）/g, ')');
}

// getMasterByNameの完全一致だけでは、実プレイで「衣装がうまく購入できない」の
// 主因になっていた: 衣装マスタ名は「メイド服(クラシック/ミニスカート)」
// 「ゴスロリ（ゴシックロリータ）」のように括弧付き補足や全角/半角混在が多く、
// LLMが括弧部分を省略・言い換えるだけで即座に不一致になり、フォールバックも
// 無いため常に「売り物ではないようだ」に倒れていた。
//
// 2段階で緩める:
//   1. 括弧幅だけを正規化した完全一致 —— 全角/半角の書き間違いはこれで確実に拾う。
//   2. それでも一致しなければ、キャラ名解決(participantNaming.jsの
//      buildParticipantResolver)と同じ「部分文字列一致・候補が1件に絞れる時だけ
//      採用」という緩め方。括弧の補足を省略した言い換えはこちらで拾う。
// 対象はそのWorldで実際に価格設定されている衣装マスタだけ
// (promptBuilder.jsがLLMに見せているのと同じ集合)に限定し、無関係なマスタへの
// 誤爆を避ける。どちらの段階でも1件に絞れなければnullを返し、呼び出し側は
// 「売り物ではないようだ」の安全側に倒れる。
export function resolveMasterNameFuzzy(worldId, name) {
  const exact = getMasterByName(name);
  if (exact) return exact;
  if (!name) return null;

  const products = listMastersForWorld(worldId).filter((m) => m.buy_price != null);

  const normalized = normalizeParens(name);
  const parenMatches = products.filter((m) => normalizeParens(m.name) === normalized);
  if (parenMatches.length === 1) return parenMatches[0];

  const candidates = products.filter((m) => m.name.includes(name) || name.includes(m.name));
  return candidates.length === 1 ? candidates[0] : null;
}

export function createMaster(data) {
  const columns = MASTER_FIELDS.join(', ');
  const placeholders = MASTER_FIELDS.map(() => '?').join(', ');
  const values = MASTER_FIELDS.map((f) => data[f] ?? '');
  const result = db
    .prepare(
      `INSERT INTO outfit_masters (${columns}, garment_operations, slot, buy_price, sell_price) VALUES (${placeholders}, ?, ?, ?, ?)`,
    )
    .run(...values, JSON.stringify(data.garment_operations ?? {}), data.slot ?? 'normal', data.buy_price ?? null, data.sell_price ?? null);
  return getMaster(result.lastInsertRowid);
}

export function updateMaster(id, data) {
  const setClause = MASTER_FIELDS.map((f) => `${f} = ?`).join(', ');
  const values = MASTER_FIELDS.map((f) => data[f] ?? '');
  db.prepare(`UPDATE outfit_masters SET ${setClause}, garment_operations = ?, slot = ?, buy_price = ?, sell_price = ? WHERE id = ?`).run(
    ...values,
    JSON.stringify(data.garment_operations ?? {}),
    data.slot ?? 'normal',
    data.buy_price ?? null,
    data.sell_price ?? null,
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

// PLAN_2026-08-02_outfit_spec_revision.md 実装順4: マスタをキャラの衣装として
// 取り込む。copy=タグ列を1回だけコピーして以後独立編集、reference=タグ列を
// 空のまま作成し、読み出し時に composeWornOutfit がマスタから解決する。
// garment_operations も link_mode で gate する — reference の衣装側は
// 「本当に空」を保つ(将来この列を直接読む経路ができた時の地雷を避ける)。
export function instantiateMasterForCharacter(characterId, masterId, { name, link_mode = 'copy' } = {}) {
  const master = getMaster(masterId);
  if (!master) return null;
  const isReference = link_mode === 'reference';
  const tagValues = isReference ? {} : Object.fromEntries(OUTFIT_TAG_FIELDS.map((f) => [f, master[f]]));
  return createOutfit(characterId, {
    name: name || master.name,
    clothing_description: master.clothing_description,
    equipment_description: master.equipment_description,
    garment_operations: isReference ? {} : master.garment_operations,
    outfit_master_id: master.id,
    link_mode,
    ...tagValues,
  });
}

// instantiateMasterForCharacter の「上書き」版。新規追加だと立ち絵/表情差分が
// 別のoutfit行に紐づいてしまい、既存の生成済み画像との紐づけをやり直す必要が
// 出てしまう(ユーザー要望)ため、既存のoutfit行のタグ内容だけをマスタの値で
// 差し替える。standing_image_path/outfit_expression_imagesはupdateOutfitの
// SET対象外なのでそのまま引き継がれる。is_default等の他フィールドも
// getOutfit(outfitId)で読んだ既存値をそのまま維持する。
export function overwriteOutfitFromMaster(outfitId, masterId, { name, link_mode = 'copy' } = {}) {
  const master = getMaster(masterId);
  const outfit = getOutfit(outfitId);
  if (!master || !outfit) return null;
  const isReference = link_mode === 'reference';
  const tagValues = isReference
    ? Object.fromEntries(OUTFIT_TAG_FIELDS.map((f) => [f, '']))
    : Object.fromEntries(OUTFIT_TAG_FIELDS.map((f) => [f, master[f]]));
  return updateOutfit(outfitId, {
    ...outfit,
    name: name || master.name,
    clothing_description: master.clothing_description,
    equipment_description: master.equipment_description,
    garment_operations: isReference ? {} : master.garment_operations,
    outfit_master_id: master.id,
    link_mode,
    ...tagValues,
  });
}

// PLAN_2026-08-02_outfit_spec_revision.md 実装順6: 「着る」用。同じマスタから
// 既に取り込み済みの衣装インスタンスがあればそれを使い回す(毎回新規作成すると、
// 着るたびに空の立ち絵/表情差分を持つ行が増えてしまう)。無ければ実装順4の
// copyモードで新規作成する。
export function wearMasterAsCharacter(characterId, masterId) {
  const existing = db
    .prepare('SELECT * FROM outfits WHERE character_id = ? AND outfit_master_id = ? ORDER BY id ASC LIMIT 1')
    .get(characterId, masterId);
  if (existing) return existing;
  return instantiateMasterForCharacter(characterId, masterId, { link_mode: 'copy' });
}

// instantiateMasterForCharacter の逆方向: 既にキャラ個別に定義済みの衣装
// (制服など複数キャラでほぼ同一のタグを個別入力しているもの)から新規マスタを
// 作る。第10段(既存データ整理)の前作業を軽くする狙い -- 代表となる1キャラの
// 衣装をこれでマスタ化すれば、他キャラは既存の「マスタから追加」UIで
// 置き換えるだけで済み、19タグの再入力が要らない。
// 元の衣装行は新マスタへ link_mode='copy' でリンクし直す(タグ値はそのまま
// -- copyは元々「取り込み後に個別編集自由」なので detach 相当の作業は不要。
// outfit_master_id は由来の記録として残す)。
export function createMasterFromOutfit(outfitId, { name, attribute_tags = '', slot = 'normal' } = {}) {
  const outfit = getOutfit(outfitId);
  if (!outfit) return null;
  const master = createMaster({
    name: name || outfit.name,
    clothing_description: outfit.clothing_description,
    equipment_description: outfit.equipment_description,
    attribute_tags,
    slot,
    garment_operations: outfit.garment_operations,
    ...Object.fromEntries(OUTFIT_TAG_FIELDS.map((f) => [f, outfit[f]])),
  });
  updateOutfit(outfitId, { ...outfit, outfit_master_id: master.id, link_mode: 'copy' });
  return master;
}

// reference衣装がキャラ個別編集の行き止まりにならないための脱出口。
// outfit_master_id は記録として残す(以後 link_mode='copy' なので参照されない)。
// link_mode !== 'reference' のガードは、既にcopyモードの衣装(outfit_master_id
// は由来の記録として残っている)に誤って呼ばれても、個別編集済みのタグを
// マスタの現在値で上書きしてしまわないため。
export function detachMasterLink(outfitId) {
  const outfit = getOutfit(outfitId);
  if (!outfit || outfit.link_mode !== 'reference' || !outfit.outfit_master_id) return outfit;
  const master = getMaster(outfit.outfit_master_id);
  if (!master) return outfit;
  const tagValues = Object.fromEntries(OUTFIT_TAG_FIELDS.map((f) => [f, master[f]]));
  return updateOutfit(outfitId, { ...outfit, ...tagValues, garment_operations: master.garment_operations, link_mode: 'copy' });
}
