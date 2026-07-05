import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { createOutfit, updateOutfit, deleteOutfit, setStandingImage, setExpressionImage } from '../db/repositories/outfitsRepo.js';

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
