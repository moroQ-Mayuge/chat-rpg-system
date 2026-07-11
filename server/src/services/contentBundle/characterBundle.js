import { db } from '../../db/connection.js';
import { getCharacter, createCharacter, CHARACTER_TEXT_FIELDS } from '../../db/repositories/charactersRepo.js';
import { createOutfit, setStandingImage, setExpressionImage, deleteOutfit } from '../../db/repositories/outfitsRepo.js';
import { saveCharacterImage } from '../../storage/imageStorage.js';
import { extensionOf } from './diskImages.js';

export function collectCharacterEntry(characterId, imageCollector) {
  const character = getCharacter(characterId);
  const fields = Object.fromEntries(CHARACTER_TEXT_FIELDS.map((f) => [f, character[f]]));
  return {
    ...fields,
    event_participation_weight: character.event_participation_weight,
    relationship_defaults: character.relationship_defaults.map((d) => ({ axis_name: d.axis_name, initial_value: d.initial_value })),
    outfits: character.outfits.map((outfit) => ({
      name: outfit.name,
      clothing_description: outfit.clothing_description,
      equipment_description: outfit.equipment_description,
      image_tags: outfit.image_tags,
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
