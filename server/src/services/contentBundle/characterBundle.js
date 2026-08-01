import { db } from '../../db/connection.js';
import { getCharacter, createCharacter, CHARACTER_TEXT_FIELDS } from '../../db/repositories/charactersRepo.js';
import { createOutfit, setStandingImage, setExpressionImage, deleteOutfit, OUTFIT_TAG_FIELDS } from '../../db/repositories/outfitsRepo.js';
import { saveCharacterImage } from '../../storage/imageStorage.js';
import { extensionOf } from './diskImages.js';

export function collectCharacterEntry(characterId, imageCollector) {
  const character = getCharacter(characterId);
  const fields = Object.fromEntries(CHARACTER_TEXT_FIELDS.map((f) => [f, character[f]]));
  return {
    ...fields,
    event_participation_weight: character.event_participation_weight,
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

export async function importCharacterEntries(entries, readImage, warnings) {
  const created = [];
  for (const entry of entries) {
    const relationshipDefaults = (entry.relationship_defaults ?? [])
      .map((d) => ({ relationship_axis_id: resolveAxisId(d.axis_name, warnings), initial_value: d.initial_value }))
      .filter((d) => d.relationship_axis_id != null);
    const character = createCharacter({ ...entry, relationship_defaults: relationshipDefaults });

    // createCharacter always auto-creates a default "通常" outfit — replace it
    // with the bundle's own outfits rather than merging alongside it.
    for (const autoOutfit of character.outfits) deleteOutfit(autoOutfit.id);

    for (const outfitData of entry.outfits ?? []) {
      const outfit = createOutfit(character.id, outfitData);
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
    created.push(getCharacter(character.id));
  }
  return created;
}
