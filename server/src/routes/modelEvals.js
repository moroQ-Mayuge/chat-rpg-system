import { Router } from 'express';
import {
  listScenarios, getScenario, createScenario, updateScenario, deleteScenario,
  listRuns, getRun, listResultsForRun, setManualScore,
} from '../db/repositories/modelEvalRepo.js';
import { startRun, cancelActiveRun, getActiveRunId } from '../services/modelEval/runner.js';
import { SCORERS, DEFAULT_WEIGHTS, weightedTotal } from '../services/modelEval/scorers.js';

export const modelEvalsRouter = Router();

// 採点軸の一覧(ラベルと既定の重み)。比較表の行見出しをクライアントで
// ハードコードしないためのもの。
modelEvalsRouter.get('/criteria', (req, res) => {
  res.json(
    Object.entries(SCORERS).map(([key, { label }]) => ({
      key,
      label,
      default_weight: DEFAULT_WEIGHTS[key] ?? 0,
    })),
  );
});

modelEvalsRouter.get('/scenarios', (req, res) => {
  res.json(listScenarios());
});

modelEvalsRouter.post('/scenarios', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name_required' });
  res.status(201).json(createScenario(req.body));
});

modelEvalsRouter.put('/scenarios/:id', (req, res) => {
  if (!getScenario(req.params.id)) return res.status(404).json({ error: 'not_found' });
  res.json(updateScenario(req.params.id, req.body));
});

modelEvalsRouter.delete('/scenarios/:id', (req, res) => {
  res.json(deleteScenario(req.params.id));
});

modelEvalsRouter.get('/runs', (req, res) => {
  res.json({ runs: listRuns(), active_run_id: getActiveRunId() });
});

modelEvalsRouter.post('/runs', (req, res) => {
  const { scenario_ids, model_filenames, repetitions, mode, weights } = req.body;
  if (!Array.isArray(scenario_ids) || scenario_ids.length === 0) {
    return res.status(400).json({ error: 'scenario_ids_required' });
  }
  if (mode !== 'current' && (!Array.isArray(model_filenames) || model_filenames.length === 0)) {
    return res.status(400).json({ error: 'model_filenames_required' });
  }
  try {
    const run = startRun({
      scenarioIds: scenario_ids,
      modelFilenames: model_filenames ?? [],
      repetitions: repetitions ?? 1,
      mode: mode ?? 'auto',
      weights,
    });
    res.status(201).json(run);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 進捗＋集計。クライアントは実行中これをポーリングする。
modelEvalsRouter.get('/runs/:id', (req, res) => {
  const run = getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'not_found' });

  const results = listResultsForRun(run.id);
  const weights = Object.keys(run.weights ?? {}).length > 0 ? run.weights : DEFAULT_WEIGHTS;

  // モデル×軸で平均する。1ターン=1サンプルとして扱う。
  const byModel = new Map();
  for (const r of results) {
    if (!byModel.has(r.model_name)) byModel.set(r.model_name, []);
    byModel.get(r.model_name).push(r);
  }

  const summary = [...byModel.entries()].map(([modelName, rows]) => {
    const criteria = {};
    for (const key of Object.keys(SCORERS)) {
      const values = rows.map((r) => r.scores?.[key]?.score).filter((v) => typeof v === 'number');
      criteria[key] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    }
    const totals = rows.map((r) => weightedTotal(r.scores ?? {}, weights));
    const manual = rows.map((r) => r.manual_score).filter((v) => typeof v === 'number');
    const latencies = rows.map((r) => r.latency_ms).filter((v) => typeof v === 'number');
    return {
      model_name: modelName,
      sample_count: rows.length,
      criteria,
      total: totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0,
      manual_average: manual.length ? manual.reduce((a, b) => a + b, 0) / manual.length : null,
      manual_count: manual.length,
      avg_latency_ms: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
    };
  });
  summary.sort((a, b) => b.total - a.total);

  res.json({ run, summary, weights, is_active: getActiveRunId() === run.id });
});

modelEvalsRouter.get('/runs/:id/results', (req, res) => {
  if (!getRun(req.params.id)) return res.status(404).json({ error: 'not_found' });
  res.json(listResultsForRun(req.params.id));
});

modelEvalsRouter.post('/runs/:id/cancel', (req, res) => {
  res.json(cancelActiveRun());
});

modelEvalsRouter.put('/results/:id/manual', (req, res) => {
  const { manual_score, manual_note } = req.body;
  if (manual_score != null && !(manual_score >= 1 && manual_score <= 5)) {
    return res.status(400).json({ error: 'manual_score_out_of_range' });
  }
  res.json(setManualScore(req.params.id, { manual_score, manual_note }));
});
