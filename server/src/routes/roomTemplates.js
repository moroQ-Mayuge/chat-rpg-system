import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import {
  listRoomTemplates,
  getRoomTemplate,
  getRoomTemplateForWorld,
  createRoomTemplate,
  updateRoomTemplate,
  deleteRoomTemplate,
  setBackgroundImage,
} from '../db/repositories/roomTemplatesRepo.js';
import {
  listRoomTemplatesForWorld,
  listWorldsForRoomTemplate,
  attachRoomToWorld,
  detachRoomFromWorld,
  setTagMatchMaxCount,
} from '../db/repositories/worldRoomTemplatesRepo.js';
import { replaceAssignmentsForSlot } from '../db/repositories/worldRoomSlotAssignmentsRepo.js';
import { replacePropsForWorldRoom } from '../db/repositories/worldRoomPropsRepo.js';
import { generateRoomBackgroundImage } from '../services/roomBackgroundImageGenerator.js';
import { enqueueImageJob } from '../services/imageQueue.js';
import { listConnectionsFrom, createConnection } from '../db/repositories/roomConnectionsRepo.js';
import { exportRoomTemplateBundle } from '../services/contentBundle/index.js';

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

// Rooms are shared master data (0030_room_world_decoupling.sql); ?world_id
// filters to rooms attached to that World (what RoomPickerPage etc. use).
roomTemplatesRouter.get('/', (req, res) => {
  if (req.query.world_id) return res.json(listRoomTemplatesForWorld(Number(req.query.world_id)));
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

// Which Worlds this room master is attached to, and attaching/detaching it.
roomTemplatesRouter.get('/:id/worlds', (req, res) => {
  res.json(listWorldsForRoomTemplate(req.params.id));
});

roomTemplatesRouter.post('/:id/worlds', (req, res) => {
  if (!req.body.world_id) return res.status(400).json({ error: 'world_id_required' });
  res.status(201).json(attachRoomToWorld(req.body.world_id, req.params.id));
});

roomTemplatesRouter.delete('/:id/worlds/:worldId', (req, res) => {
  res.json(detachRoomFromWorld(req.params.worldId, req.params.id));
});

// The per-World room-instance config: slot assignments, props, free props,
// and the connection graph, all scoped to (room, world).
roomTemplatesRouter.get('/:id/worlds/:worldId/config', (req, res) => {
  const config_ = getRoomTemplateForWorld(req.params.id, req.params.worldId);
  if (!config_) return res.status(404).json({ error: 'not_found' });
  res.json(config_);
});

roomTemplatesRouter.put('/:id/worlds/:worldId/config', (req, res) => {
  const { worldId } = req.params;
  const roomTemplateId = req.params.id;
  for (const slot of req.body.slot_assignments ?? []) {
    replaceAssignmentsForSlot(worldId, slot.slot_id, slot.assignments ?? []);
  }
  if ('tag_match_max_count' in req.body) {
    setTagMatchMaxCount(worldId, roomTemplateId, req.body.tag_match_max_count ?? null);
  }
  replacePropsForWorldRoom(worldId, roomTemplateId, {
    propIds: req.body.prop_ids ?? [],
    freeProps: (req.body.free_props ?? []).map((p) => (typeof p === 'string' ? p : p.description)),
  });
  res.json(getRoomTemplateForWorld(roomTemplateId, worldId));
});

// Connections are always browsed/created relative to a specific room
// template (the "from" side) within a specific World; PUT/DELETE on an
// existing connection go through roomConnectionsRouter instead, since those
// don't need the from-side/world context.
roomTemplatesRouter.get('/:id/connections', (req, res) => {
  if (!req.query.world_id) return res.status(400).json({ error: 'world_id_required' });
  res.json(listConnectionsFrom(req.params.id, Number(req.query.world_id)));
});

roomTemplatesRouter.post('/:id/connections', (req, res) => {
  if (!req.body.world_id) return res.status(400).json({ error: 'world_id_required' });
  res.status(201).json(createConnection({ ...req.body, from_room_template_id: req.params.id }));
});

roomTemplatesRouter.get('/:id/export-bundle', async (req, res) => {
  const template = getRoomTemplate(req.params.id);
  if (!template) return res.status(404).json({ error: 'not_found' });
  try {
    const zipBuffer = await exportRoomTemplateBundle(req.params.id, {
      includeCharacters: req.query.include_characters === '1',
    });
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(template.name)}.zip"`);
    res.send(zipBuffer);
  } catch (err) {
    res.status(500).json({ error: 'export_failed', message: err.message });
  }
});

// world_id: a room-master admin action has no playthrough in scope, so the
// caller explicitly says which of the room's attached Worlds' style preset
// to generate with (see roomBackgroundImageGenerator.js).
roomTemplatesRouter.post('/:id/generate-background-image', (req, res) => {
  const template = getRoomTemplate(req.params.id);
  if (!template) return res.status(404).json({ error: 'not_found' });
  const mode = req.body.mode === 'refine' ? 'refine' : 'fresh';

  enqueueImageJob(async () => {
    try {
      const imagePath = await generateRoomBackgroundImage(template, mode, req.body.extra_hint, req.body.world_id ?? null);
      res.json(setBackgroundImage(req.params.id, imagePath));
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });
});
