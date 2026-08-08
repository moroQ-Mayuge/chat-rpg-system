import { getMaster, createMaster } from '../../db/repositories/outfitMastersRepo.js';
import { OUTFIT_TAG_FIELDS } from '../../db/repositories/outfitsRepo.js';

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
export function importOutfitMasterEntries(entries) {
  return entries.map((entry) => createMaster(entry));
}
