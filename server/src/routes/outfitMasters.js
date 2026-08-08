import { Router } from 'express';
import {
  listMastersForWorld,
  listAllMasters,
  getMaster,
  createMaster,
  updateMaster,
  deleteMaster,
  listWorldsForMaster,
  attachMasterToWorld,
  detachMasterFromWorld,
} from '../db/repositories/outfitMastersRepo.js';
import { exportOutfitMastersBundle } from '../services/contentBundle/index.js';

export const outfitMastersRouter = Router();

outfitMastersRouter.get('/', (req, res) => {
  res.json(req.query.world_id ? listMastersForWorld(req.query.world_id) : listAllMasters());
});

// Must be registered before '/:id' below -- "export-bundle" would otherwise
// be captured as an :id value.
outfitMastersRouter.get('/export-bundle', async (req, res) => {
  const ids = (req.query.ids ?? '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n));
  if (ids.length === 0) return res.status(400).json({ error: 'ids_required' });
  try {
    const zipBuffer = await exportOutfitMastersBundle(ids);
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="outfit-masters-bundle-${ids.length}.zip"`);
    res.send(zipBuffer);
  } catch (err) {
    res.status(500).json({ error: 'export_failed', message: err.message });
  }
});

outfitMastersRouter.post('/', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name_required' });
  res.status(201).json(createMaster(req.body));
});

outfitMastersRouter.put('/:id', (req, res) => {
  const existing = getMaster(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  res.json(updateMaster(req.params.id, req.body));
});

outfitMastersRouter.delete('/:id', (req, res) => {
  res.json(deleteMaster(req.params.id));
});

outfitMastersRouter.get('/:id/worlds', (req, res) => {
  res.json(listWorldsForMaster(req.params.id));
});

outfitMastersRouter.post('/:id/worlds', (req, res) => {
  res.json(attachMasterToWorld(req.body.world_id, req.params.id));
});

outfitMastersRouter.delete('/:id/worlds/:worldId', (req, res) => {
  res.json(detachMasterFromWorld(req.params.worldId, req.params.id));
});
