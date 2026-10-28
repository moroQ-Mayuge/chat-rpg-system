import { getMaster, createMaster, updateMaster } from '../../db/repositories/outfitMastersRepo.js';
import { OUTFIT_TAG_FIELDS } from '../../db/repositories/outfitsRepo.js';
import { createImportPlan, findExistingOutfitMaster, renamedForImport } from './importPlan.js';

// outfit_masters は relationship_axes/expression_types と同じ「宛先install
// 既存前提のグローバル参照マスタ」で、画像を一切持たない(立ち絵/表情差分は
// outfits側のみ)ため、characterBundle.js のような imageCollector は不要。
export function collectOutfitMasterEntries(masterIds) {
  return masterIds
    .map((id) => getMaster(id))
    .filter(Boolean)
    .map((m) => ({
      name: m.name,
      slot: m.slot,
      clothing_description: m.clothing_description,
      equipment_description: m.equipment_description,
      attribute_tags: m.attribute_tags,
      garment_operations: m.garment_operations,
      ...Object.fromEntries(OUTFIT_TAG_FIELDS.map((f) => [f, m[f]])),
    }));
}

// createMaster は world_outfit_masters 行を作らないため、インポートされた
// マスタは常に「共通(全Worldで使用可能)」になる -- 新規作成時の既定動作と同じ。
//
// 同名のマスタが既にある場合は plan(importPlan.js)の判断に従う。上書きは既存のidを
// 保つ(キャラの衣装が参照しているため)。価格(買値/売値/非売品)はバンドルに載らない
// 項目なので、既存の値を土台にして消さない。
// 戻り値の created は新規に作った分だけ。plan.outfitMasterIdByName には、全件の
// 「元の名前→実id」を残す(同じバンドルのキャラの衣装が別名で新規にした方を指せるように)。
export function importOutfitMasterEntries(entries, plan = createImportPlan()) {
  const created = [];
  for (const entry of entries) {
    const { action, existing } = plan.resolve('outfit_master', entry.name, findExistingOutfitMaster(entry.name));
    if (action === 'skip') {
      plan.outfitMasterIdByName.set(entry.name, existing.id);
      continue;
    }
    let master;
    if (action === 'overwrite') {
      master = updateMaster(existing.id, { ...getMaster(existing.id), ...entry });
    } else {
      master = createMaster({ ...entry, name: action === 'rename' ? renamedForImport(entry.name) : entry.name });
      created.push(master);
    }
    plan.outfitMasterIdByName.set(entry.name, master.id);
  }
  return created;
}
