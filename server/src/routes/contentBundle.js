import { Router } from 'express';
import multer from 'multer';
import { importBundle } from '../services/contentBundle/index.js';

const upload = multer({ storage: multer.memoryStorage() });

export const contentBundleRouter = Router();

// Single shared import endpoint for character/world/room-template bundles —
// the importer inspects the manifest's populated arrays rather than needing
// a separate route per export kind. target_world_id is only required when
// the bundle has no worlds of its own (a standalone room-template export).
contentBundleRouter.post('/import', upload.single('bundle'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'bundle_required' });
  try {
    const targetWorldId = req.body.target_world_id ? Number(req.body.target_world_id) : null;
    const result = await importBundle(req.file.buffer, { targetWorldId });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: 'import_failed', message: err.message });
  }
});
