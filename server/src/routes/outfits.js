import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import {
  createOutfit,
  updateOutfit,
  deleteOutfit,
  setStandingImage,
  setExpressionImage,
  getOutfit,
  OUTFIT_TAG_FIELDS,
} from '../db/repositories/outfitsRepo.js';
import { getExpressionType } from '../db/repositories/expressionTypesRepo.js';
import { instantiateMasterForCharacter, detachMasterLink, createMasterFromOutfit } from '../db/repositories/outfitMastersRepo.js';
import { generateOutfitStandingImage, generateOutfitExpressionImage } from '../services/outfitImageGenerator.js';
import { enqueueImageJob } from '../services/imageQueue.js';

// Lets the character edit form generate a preview using whatever's currently
// typed in the tag category fields, even if not saved yet — without this,
// generation always re-read the last-saved outfit row, forcing a save before
// every single prompt tweak could be tested (the exact workflow friction the
// user reported). Only known tag fields are pulled from the body; anything
// else in req.body is ignored.
export function tagOverridesFromBody(body) {
  const overrides = {};
  for (const field of OUTFIT_TAG_FIELDS) {
    if (body[field] !== undefined) overrides[field] = body[field];
  }
  return overrides;
}

export const outfitsRouter = Router();

const characterImagesDir = path.join(config.imageStorageDir, 'characters');
fs.mkdirSync(characterImagesDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, characterImagesDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `outfit${req.params.id}-${Date.now()}${ext}`);
    },
  }),
});

outfitsRouter.post('/characters/:characterId/outfits', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name_required' });
  res.status(201).json(createOutfit(req.params.characterId, req.body));
});

outfitsRouter.post('/characters/:characterId/outfits/from-master', (req, res) => {
  const outfit = instantiateMasterForCharacter(req.params.characterId, req.body.outfit_master_id, req.body);
  if (!outfit) return res.status(404).json({ error: 'master_not_found' });
  res.status(201).json(outfit);
});

outfitsRouter.post('/outfits/:id/detach-master', (req, res) => {
  res.json(detachMasterLink(req.params.id));
});

outfitsRouter.post('/outfits/:id/promote-to-master', (req, res) => {
  const master = createMasterFromOutfit(req.params.id, req.body);
  if (!master) return res.status(404).json({ error: 'outfit_not_found' });
  res.status(201).json(master);
});

outfitsRouter.put('/outfits/:id', (req, res) => {
  res.json(updateOutfit(req.params.id, req.body));
});

outfitsRouter.delete('/outfits/:id', (req, res) => {
  res.json(deleteOutfit(req.params.id));
});

outfitsRouter.post('/outfits/:id/standing-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'image_required' });
  res.json(setStandingImage(req.params.id, `/images/characters/${req.file.filename}`));
});

outfitsRouter.post('/outfits/:id/expression-image/:expressionTypeId', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'image_required' });
  res.json(setExpressionImage(req.params.id, req.params.expressionTypeId, `/images/characters/${req.file.filename}`));
});

outfitsRouter.post('/outfits/:id/generate-standing-image', (req, res) => {
  enqueueImageJob(async () => {
    try {
      const outfit = { ...getOutfit(req.params.id), ...tagOverridesFromBody(req.body) };
      const imagePath = await generateOutfitStandingImage(outfit, req.body.extra_hint);
      res.json(setStandingImage(req.params.id, imagePath));
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });
});

outfitsRouter.post('/outfits/:id/generate-expression-image/:expressionTypeId', (req, res) => {
  enqueueImageJob(async () => {
    try {
      const outfit = { ...getOutfit(req.params.id), ...tagOverridesFromBody(req.body) };
      const expressionType = getExpressionType(req.params.expressionTypeId);
      const imagePath = await generateOutfitExpressionImage(outfit, expressionType, req.body.extra_hint, req.body.mode);
      res.json(setExpressionImage(req.params.id, req.params.expressionTypeId, imagePath));
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });
});
