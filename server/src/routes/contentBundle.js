import { Router } from 'express';
import multer from 'multer';
import { importBundle, previewBundle } from '../services/contentBundle/index.js';

const upload = multer({ storage: multer.memoryStorage() });

export const contentBundleRouter = Router();

function parseTargetWorldId(body) {
  return body.target_world_id ? Number(body.target_world_id) : null;
}

// 取り込み前の確認: このバンドルで既に同名が存在するものの一覧を返す(何も変更しない)。
contentBundleRouter.post('/preview', upload.single('bundle'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'bundle_required' });
  try {
    res.json(previewBundle(req.file.buffer, { targetWorldId: parseTargetWorldId(req.body) }));
  } catch (err) {
    res.status(400).json({ error: 'preview_failed', message: err.message });
  }
});

// Single shared import endpoint for character/world/room-template bundles —
// the importer inspects the manifest's populated arrays rather than needing
// a separate route per export kind. target_world_id is only required when
// the bundle has no worlds of its own (a standalone room-template export).
// decisions(任意): 同名の既存データごとの判断のJSON({ "<種別>:<名前>": "overwrite"|"new"|"skip" })。
// multipartのテキスト欄なので文字列で届く。
contentBundleRouter.post('/import', upload.single('bundle'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'bundle_required' });
  try {
    let decisions = {};
    if (req.body.decisions) {
      decisions = JSON.parse(req.body.decisions);
      if (decisions == null || typeof decisions !== 'object' || Array.isArray(decisions)) {
        return res.status(400).json({ error: 'invalid_decisions' });
      }
    }
    const result = await importBundle(req.file.buffer, { targetWorldId: parseTargetWorldId(req.body), decisions });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: 'import_failed', message: err.message });
  }
});
