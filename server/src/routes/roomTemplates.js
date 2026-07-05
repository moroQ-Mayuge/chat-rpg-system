import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import {
  listRoomTemplates,
  getRoomTemplate,
  createRoomTemplate,
  updateRoomTemplate,
  deleteRoomTemplate,
  setBackgroundImage,
} from '../db/repositories/roomTemplatesRepo.js';

export const roomTemplatesRouter = Router();

const roomImagesDir = path.join(config.imageStorageDir, 'rooms');
fs.mkdirSync(roomImagesDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, roomImagesDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `${req.params.id}-${Date.now()}${ext}`);
    },
  }),
});

roomTemplatesRouter.get('/', (req, res) => {
  res.json(listRoomTemplates());
});

roomTemplatesRouter.get('/:id', (req, res) => {
  const template = getRoomTemplate(req.params.id);
  if (!template) return res.status(404).json({ error: 'not_found' });
  res.json(template);
});

roomTemplatesRouter.post('/', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name_required' });
  res.status(201).json(createRoomTemplate(req.body));
});

roomTemplatesRouter.put('/:id', (req, res) => {
  const existing = getRoomTemplate(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  res.json(updateRoomTemplate(req.params.id, req.body));
});

roomTemplatesRouter.delete('/:id', (req, res) => {
  res.json(deleteRoomTemplate(req.params.id));
});

roomTemplatesRouter.post('/:id/background-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'image_required' });
  const relativePath = `/images/rooms/${req.file.filename}`;
  res.json(setBackgroundImage(req.params.id, relativePath));
});
