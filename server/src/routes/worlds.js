import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { listWorlds, getWorld, createWorld, updateWorld, deleteWorld, setThumbnailImage } from '../db/repositories/worldsRepo.js';
import { generateWorldThumbnail } from '../services/worldThumbnailGenerator.js';
import { enqueueImageJob } from '../services/imageQueue.js';
import { exportWorldBundle } from '../services/contentBundle/index.js';

export const worldsRouter = Router();

const worldImagesDir = path.join(config.imageStorageDir, 'worlds');
fs.mkdirSync(worldImagesDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, worldImagesDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `${req.params.id}-${Date.now()}${ext}`);
    },
  }),
});

worldsRouter.get('/', (req, res) => {
  res.json(listWorlds());
});

worldsRouter.get('/:id', (req, res) => {
  const world = getWorld(req.params.id);
  if (!world) return res.status(404).json({ error: 'not_found' });
  res.json(world);
});

worldsRouter.post('/', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name_required' });
  res.status(201).json(createWorld(req.body));
});

worldsRouter.put('/:id', (req, res) => {
  const existing = getWorld(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  if (existing.is_unassigned_bucket) return res.status(400).json({ error: 'unassigned_bucket_immutable' });
  res.json(updateWorld(req.params.id, req.body));
});

worldsRouter.delete('/:id', (req, res) => {
  const result = deleteWorld(req.params.id);
  if (!result.deleted) return res.status(400).json({ error: result.reason });
  res.json(result);
});

worldsRouter.post('/:id/thumbnail-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'image_required' });
  const relativePath = `/images/worlds/${req.file.filename}`;
  res.json(setThumbnailImage(req.params.id, relativePath));
});

worldsRouter.get('/:id/export-bundle', async (req, res) => {
  const world = getWorld(req.params.id);
  if (!world) return res.status(404).json({ error: 'not_found' });
  try {
    const zipBuffer = await exportWorldBundle(req.params.id, {
      includeRoomTemplates: req.query.include_room_templates === '1',
      includeCharacters: req.query.include_characters === '1',
    });
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(world.name)}.zip"`);
    res.send(zipBuffer);
  } catch (err) {
    res.status(500).json({ error: 'export_failed', message: err.message });
  }
});

worldsRouter.post('/:id/generate-thumbnail-image', (req, res) => {
  const world = getWorld(req.params.id);
  if (!world) return res.status(404).json({ error: 'not_found' });

  enqueueImageJob(async () => {
    try {
      const imagePath = await generateWorldThumbnail(world, req.body.extra_hint);
      res.json(setThumbnailImage(req.params.id, imagePath));
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });
});
