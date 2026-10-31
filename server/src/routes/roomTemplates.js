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
  setTagMatchProbabilities,
} from '../db/repositories/worldRoomTemplatesRepo.js';
import { replaceAssignmentsForSlot } from '../db/repositories/worldRoomSlotAssignmentsRepo.js';
import { replacePropsForWorldRoom } from '../db/repositories/worldRoomPropsRepo.js';
import { replacePropsForWorldSubRoom } from '../db/repositories/worldSubRoomPropsRepo.js';
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

// サブ部屋(0150)の背景画像。ファイルを保存してパスを返すだけで、DBへの反映は
// 部屋の保存(PUT /:id、sub_rooms[].background_image_path)に相乗りする——保存前の
// フォーム編集内容が再取得で消えないよう、ここではroom_templateを更新しない。
roomTemplatesRouter.post('/:id/sub-room-background-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'image_required' });
  res.json({ background_image_path: `/images/rooms/${req.file.filename}` });
});

// サブ部屋の背景画像の生成。アップロード(上)と同じく、画像を保存してパスだけを返し、DBへの
// 反映は部屋の保存(PUT /:id、sub_rooms[].background_image_path)に相乗りする——保存前の
// 編集内容が再取得で消えないよう、ここでは部屋もサブ部屋も更新しない(未保存の新規サブ部屋にも使える)。
// location_tags/atmosphere_tags: 画面が解決した「このサブ部屋の実効タグ」(サブ部屋のタグが空なら
// 部屋本体のタグ、実行時の場所タグの解決と同じ)。source_image_path: 「現在の画像から調整」(refine)の
// 元にするサブ部屋自身の背景(/images/rooms/ 配下のみ受け付ける)。
roomTemplatesRouter.post('/:id/generate-sub-room-background-image', (req, res) => {
  const room = getRoomTemplate(req.params.id);
  if (!room) return res.status(404).json({ error: 'not_found' });
  const { location_tags, atmosphere_tags, source_image_path, extra_hint, world_id } = req.body;
  const mode = req.body.mode === 'refine' ? 'refine' : 'fresh';
  if (mode === 'refine' && (!/^\/images\/rooms\/[\w.-]+$/.test(source_image_path ?? '') || source_image_path.includes('..'))) {
    return res.status(400).json({ error: 'invalid_source_image_path' });
  }

  enqueueImageJob(async () => {
    try {
      const imagePath = await generateRoomBackgroundImage(
        {
          id: room.id,
          location_tags: typeof location_tags === 'string' ? location_tags : '',
          atmosphere_tags: typeof atmosphere_tags === 'string' ? atmosphere_tags : '',
          background_image_path: mode === 'refine' ? source_image_path : null,
        },
        mode,
        extra_hint,
        world_id ?? null,
      );
      res.json({ background_image_path: imagePath });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });
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
  if ('tag_match_probabilities' in req.body) {
    setTagMatchProbabilities(worldId, roomTemplateId, req.body.tag_match_probabilities);
  }
  replacePropsForWorldRoom(worldId, roomTemplateId, {
    propIds: req.body.prop_ids ?? [],
    freeProps: (req.body.free_props ?? []).map((p) => (typeof p === 'string' ? p : p.description)),
  });
  // サブ部屋(0150/Stage 4)ごとの追加設備。[{sub_room_id, prop_ids, free_props}]。
  for (const entry of req.body.sub_room_props ?? []) {
    replacePropsForWorldSubRoom(worldId, entry.sub_room_id, {
      propIds: entry.prop_ids ?? [],
      freeProps: (entry.free_props ?? []).map((p) => (typeof p === 'string' ? p : p.description)),
    });
  }
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
// location_tags/atmosphere_tags: 画面で入力中(未保存)のタグ。渡された時は保存済みの値より優先して
// プロンプトに使う——タグを直してすぐ試し生成できるように(キャラの衣装画像生成のタグ上書きと同じ考え方)。
roomTemplatesRouter.post('/:id/generate-background-image', (req, res) => {
  const stored = getRoomTemplate(req.params.id);
  if (!stored) return res.status(404).json({ error: 'not_found' });
  const template = { ...stored };
  for (const key of ['location_tags', 'atmosphere_tags']) {
    if (typeof req.body[key] === 'string') template[key] = req.body[key];
  }
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
