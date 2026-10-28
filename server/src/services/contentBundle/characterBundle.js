import { db } from '../../db/connection.js';
import { getCharacter, createCharacter, updateCharacter, CHARACTER_TEXT_FIELDS } from '../../db/repositories/charactersRepo.js';
import {
  createOutfit,
  updateOutfit,
  listOutfitsForCharacter,
  setStandingImage,
  setExpressionImage,
  deleteOutfit,
  OUTFIT_TAG_FIELDS,
} from '../../db/repositories/outfitsRepo.js';
import { createImportPlan, findExistingCharacter, renamedForImport } from './importPlan.js';
import { saveCharacterImage } from '../../storage/imageStorage.js';
import { extensionOf } from './diskImages.js';

export function collectCharacterEntry(characterId, imageCollector) {
  const character = getCharacter(characterId);
  const fields = Object.fromEntries(CHARACTER_TEXT_FIELDS.map((f) => [f, character[f]]));
  return {
    ...fields,
    event_participation_weight: character.event_participation_weight,
    // is_mob/cycle_enabled/cycle_offset_day も同じ穴だった: createCharacter は
    // 元から受け取れる作りなのに、エクスポート側が組み立てていなかった
    // (impression_defaults と同じ形の手落ち)。
    is_mob: Boolean(character.is_mob),
    cycle_enabled: Boolean(character.cycle_enabled),
    cycle_offset_day: character.cycle_offset_day,
    relationship_defaults: character.relationship_defaults.map((d) => ({ axis_name: d.axis_name, initial_value: d.initial_value })),
    // ユーザーが自分で名前を付けて増やせる自由記述欄(「あなたとの関係」「あなたの印象」等)。
    // インポート側(importCharacterEntries -> createCharacter -> replaceImpressionDefaults)は
    // 元から受け取れる作りだったが、エクスポート側がこの項目を組み立てておらず、
    // 書き出したバンドルには一貫して欠落していた。
    impression_defaults: character.impression_defaults.map((d) => ({ field_key: d.field_key, default_value: d.default_value })),
    outfits: character.outfits.map((outfit) => ({
      name: outfit.name,
      clothing_description: outfit.clothing_description,
      equipment_description: outfit.equipment_description,
      ...Object.fromEntries(OUTFIT_TAG_FIELDS.map((f) => [f, outfit[f]])),
      // Not part of OUTFIT_TAG_FIELDS -- that's the list of tag-string columns,
      // while this is a JSON object (garment name -> allowed disturbance
      // styles, already parsed by outfitsRepo.js's parseGarmentOperations).
      // Missing it here didn't just lose the setting on export: createOutfit
      // writes `?? {}` unconditionally, so a round-trip silently wiped it.
      garment_operations: outfit.garment_operations ?? {},
      is_default: Boolean(outfit.is_default),
      // outfit_masters は relationship_axes/expression_types と同じ「宛先install
      // に既存の前提」のグローバル参照マスタ扱い -- バンドルに同梱せず、
      // 名前だけ持ち出してimport時に引き直す(実装順9)。missingだった分、
      // link_mode='reference'の衣装は自身のタグ列が空のまま(実装順4の設計)
      // なので、これを欠かすとimport後に空タグのcopy衣装へ静かに劣化していた。
      outfit_master_name: outfit.outfit_master_id != null
        ? (db.prepare('SELECT name FROM outfit_masters WHERE id = ?').get(outfit.outfit_master_id)?.name ?? null)
        : null,
      link_mode: outfit.link_mode,
      overrides_underwear: Boolean(outfit.overrides_underwear),
      standing_image: imageCollector.add(outfit.standing_image_path, 'char-standing'),
      expression_images: outfit.expression_images.map((img) => ({
        llm_tag_key: img.llm_tag_key,
        image: imageCollector.add(img.image_path, 'char-expr'),
      })),
    })),
  };
}

// Names/keys are resolved against THIS install's own masters (relationship
// axes, expression types) rather than carried by id, since ids differ across
// installs — same philosophy as eventPortability.js's character-name resolution.
function resolveAxisId(name, warnings) {
  const axis = db.prepare('SELECT id FROM relationship_axes WHERE name = ?').get(name);
  if (!axis) {
    warnings.push(`関係性軸「${name}」が見つからず、キャラの初期値設定をスキップしました`);
    return null;
  }
  return axis.id;
}

function resolveExpressionTypeId(llmTagKey, warnings) {
  const et = db.prepare('SELECT id FROM expression_types WHERE llm_tag_key = ?').get(llmTagKey);
  if (!et) {
    warnings.push(`表情タイプ「${llmTagKey}」が見つからず、該当の表情画像をスキップしました`);
    return null;
  }
  return et.id;
}

// 同じバンドルで衣装マスタを「別名で新規」にした場合、衣装の参照先は元の名前の既存マスタでなく
// そちらの新しいマスタにしたいので、plan が持つ「元の名前→実id」を先に引く。
function resolveOutfitMasterId(name, warnings, plan) {
  const fromBatch = plan?.outfitMasterIdByName.get(name);
  if (fromBatch != null) return fromBatch;
  const master = db.prepare('SELECT id FROM outfit_masters WHERE name = ?').get(name);
  if (!master) {
    warnings.push(`衣装マスタ「${name}」が見つかりませんでした`);
    return null;
  }
  return master.id;
}

// 同名のキャラが既にある場合は plan(importPlan.js)の判断に従う。
//  - 上書き: 既存のidを保ったまま項目・関係値/印象の初期値を更新する。衣装は名前で既存の
//    衣装に対応付けて更新し、無ければ追加する(ファイルに無い既存の衣装は残す — 衣装idは
//    プレイ中の着用状態から参照されているので、作り直さない)。
//  - 別名で新規: 「名前（インポート）」で作る。 スキップ: 触らない。
// 戻り値の refs は同じバンドル内の他の取り込み(World別設定・イベント)が元の名前でキャラを
// 引き直すための {name, id}。
// plan を渡さない呼び出し(ルート固有キャラの取り込み)は常に新規作成。
export async function importCharacterEntries(entries, readImage, warnings, plan = createImportPlan(), contextWorldId = null) {
  const created = [];
  const refs = [];
  for (const entry of entries) {
    const { action, existing } = plan.resolve('character', entry.name, findExistingCharacter(entry.name, contextWorldId));
    if (action === 'skip') {
      refs.push({ name: entry.name, id: existing.id });
      continue;
    }

    const relationshipDefaults = (entry.relationship_defaults ?? [])
      .map((d) => ({ relationship_axis_id: resolveAxisId(d.axis_name, warnings), initial_value: d.initial_value }))
      .filter((d) => d.relationship_axis_id != null);

    let character;
    if (action === 'overwrite') {
      const current = getCharacter(existing.id);
      // 更新指示(update_instruction)はバンドルに載らない項目なので、同じ項目名の既存の値を引き継ぐ。
      const instructionByKey = new Map(current.impression_defaults.map((d) => [d.field_key, d.update_instruction ?? '']));
      character = updateCharacter(existing.id, {
        ...current,
        ...entry,
        relationship_defaults: relationshipDefaults,
        impression_defaults: (entry.impression_defaults ?? []).map((d) => ({
          ...d,
          update_instruction: d.update_instruction ?? instructionByKey.get(d.field_key) ?? '',
        })),
      });
    } else {
      character = createCharacter({
        ...entry,
        name: action === 'rename' ? renamedForImport(entry.name) : entry.name,
        relationship_defaults: relationshipDefaults,
      });
      // createCharacter always auto-creates a default "通常" outfit — replace it
      // with the bundle's own outfits rather than merging alongside it.
      for (const autoOutfit of character.outfits) deleteOutfit(autoOutfit.id);
    }

    for (const outfitData of entry.outfits ?? []) {
      const outfitMasterId = outfitData.outfit_master_name ? resolveOutfitMasterId(outfitData.outfit_master_name, warnings, plan) : null;
      let linkMode = outfitData.link_mode ?? 'copy';
      if (linkMode === 'reference' && outfitMasterId == null) {
        linkMode = 'copy';
        warnings.push(`衣装「${outfitData.name}」の参照先マスタが見つからないため、コピー扱いに切り替えました（タグが空の可能性があります）`);
      }
      const outfitInput = { ...outfitData, outfit_master_id: outfitMasterId, link_mode: linkMode };
      const sameNameOutfit = action === 'overwrite' ? listOutfitsForCharacter(character.id).find((o) => o.name === outfitData.name) : null;
      // 既存の衣装はバンドルに載らない項目(ネガティブプロンプト等)を保つため、既存の値を土台にする。
      const outfit = sameNameOutfit
        ? updateOutfit(sameNameOutfit.id, { ...sameNameOutfit, ...outfitInput })
        : createOutfit(character.id, outfitInput);
      if (outfitData.standing_image) {
        const imgBuffer = readImage(outfitData.standing_image);
        if (imgBuffer) {
          const savedPath = await saveCharacterImage(`char-${character.id}`, imgBuffer, extensionOf(outfitData.standing_image));
          setStandingImage(outfit.id, savedPath);
        }
      }
      for (const exprData of outfitData.expression_images ?? []) {
        const expressionTypeId = resolveExpressionTypeId(exprData.llm_tag_key, warnings);
        if (expressionTypeId == null || !exprData.image) continue;
        const imgBuffer = readImage(exprData.image);
        if (!imgBuffer) continue;
        const savedPath = await saveCharacterImage(`char-${character.id}-expr`, imgBuffer, extensionOf(exprData.image));
        setExpressionImage(outfit.id, expressionTypeId, savedPath);
      }
    }
    if (action !== 'overwrite') created.push(getCharacter(character.id));
    refs.push({ name: entry.name, id: character.id });
  }
  return { created, refs };
}
