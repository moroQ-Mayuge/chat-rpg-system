import { generateTxt2Image, generateImage } from './koboldClient.js';
import { buildReferenceAnchorCanvas, cropMainRegion } from './imagePromptBuilder.js';
import { saveCharacterImage } from '../storage/imageStorage.js';
import { resolveDefaultStylePrompt } from '../db/repositories/imageStylePresetsRepo.js';
import { getImageFormat } from '../db/repositories/imageFormatSettingsRepo.js';

const STANDING_WIDTH = 768;
const STANDING_HEIGHT = 1344;
const EXPRESSION_SIZE = 1024;

// Outfit assets aren't tied to any particular World (a Character can appear
// in several), so there's no World to resolve a style preset from — always
// falls back to whichever preset is_default (SPEC.md-adjacent design note).
function combinePrompt(outfit, extraTags) {
  return [resolveDefaultStylePrompt(), outfit.image_tags, extraTags].filter(Boolean).join(', ');
}

// Generates a fresh standing image (立ち絵) for an Outfit via plain txt2img —
// there is no prior reference to stay consistent with yet, since this image
// itself becomes the reference used everywhere else (SPEC.md 3.7).
export async function generateOutfitStandingImage(outfit, extraHint) {
  const prompt = combinePrompt(outfit, extraHint);
  const buffer = await generateTxt2Image({ prompt, width: STANDING_WIDTH, height: STANDING_HEIGHT });
  return saveCharacterImage(`outfit${outfit.id}-standing`, buffer, getImageFormat('standing'));
}

// Generates one expression-differential image for an Outfit. If a standing
// image already exists, it's used as the reference-anchor image so the face
// stays consistent with the character's established appearance (same
// technique as scene generation, SPEC.md 3.7); otherwise falls back to a
// plain generation from tags alone.
export async function generateOutfitExpressionImage(outfit, expressionType, extraHint) {
  const prompt = combinePrompt(outfit, [expressionType.llm_tag_key, extraHint].filter(Boolean).join(', '));
  const referencePaths = outfit.standing_image_path ? [outfit.standing_image_path] : [];

  const { canvasBase64, maskBase64, anchorOffset } = await buildReferenceAnchorCanvas(
    referencePaths,
    EXPRESSION_SIZE,
    EXPRESSION_SIZE,
  );

  const resultBuffer = await generateImage({
    initImageBase64: canvasBase64,
    maskBase64,
    prompt,
    width: EXPRESSION_SIZE + anchorOffset,
    height: EXPRESSION_SIZE,
  });

  const finalBuffer = await cropMainRegion(resultBuffer, anchorOffset, EXPRESSION_SIZE, EXPRESSION_SIZE);
  return saveCharacterImage(`outfit${outfit.id}-${expressionType.llm_tag_key}`, finalBuffer, getImageFormat('expression'));
}
