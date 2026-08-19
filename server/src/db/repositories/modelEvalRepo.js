import { db } from '../connection.js';

// JSON列を持つテーブルなので、読み出し時に必ずパースして返す(他のリポジトリの
// parseWorld/parseGarmentOperations等と同じ方針)。壊れたJSONで画面全体が落ちる
// のを避けるため、パース失敗時は既定値へ倒す。
function safeParse(text, fallback) {
  try {
    return JSON.parse(text || '');
  } catch {
    return fallback;
  }
}

function parseScenario(row) {
  if (!row) return row;
  return {
    ...row,
    character_ids: safeParse(row.character_ids, []),
    turns: safeParse(row.turns, []),
    enabled: Boolean(row.enabled),
  };
}

function parseRun(row) {
  if (!row) return row;
  return {
    ...row,
    model_names: safeParse(row.model_names, []),
    sampler_settings: safeParse(row.sampler_settings, {}),
    weights: safeParse(row.weights, {}),
  };
}

function parseResult(row) {
  if (!row) return row;
  return { ...row, scores: safeParse(row.scores, {}) };
}

// ── シナリオ ────────────────────────────────────────────────
export function listScenarios() {
  return db.prepare('SELECT * FROM model_eval_scenarios ORDER BY sort_order ASC, id ASC').all().map(parseScenario);
}

export function getScenario(id) {
  return parseScenario(db.prepare('SELECT * FROM model_eval_scenarios WHERE id = ?').get(id));
}

export function createScenario({ name, description, category, world_id, room_template_id, character_ids, turns, sort_order, enabled }) {
  const result = db
    .prepare(
      `INSERT INTO model_eval_scenarios (name, description, category, world_id, room_template_id, character_ids, turns, sort_order, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      name,
      description ?? '',
      category ?? '',
      world_id ?? null,
      room_template_id ?? null,
      JSON.stringify(character_ids ?? []),
      JSON.stringify(turns ?? []),
      sort_order ?? 0,
      enabled === false ? 0 : 1,
    );
  return getScenario(result.lastInsertRowid);
}

export function updateScenario(id, { name, description, category, world_id, room_template_id, character_ids, turns, sort_order, enabled }) {
  db.prepare(
    `UPDATE model_eval_scenarios
     SET name = ?, description = ?, category = ?, world_id = ?, room_template_id = ?,
         character_ids = ?, turns = ?, sort_order = ?, enabled = ?
     WHERE id = ?`,
  ).run(
    name,
    description ?? '',
    category ?? '',
    world_id ?? null,
    room_template_id ?? null,
    JSON.stringify(character_ids ?? []),
    JSON.stringify(turns ?? []),
    sort_order ?? 0,
    enabled === false ? 0 : 1,
    id,
  );
  return getScenario(id);
}

export function deleteScenario(id) {
  db.prepare('DELETE FROM model_eval_scenarios WHERE id = ?').run(id);
  return { deleted: true };
}

// ── 実行 ────────────────────────────────────────────────────
export function createRun({ mode, model_names, repetitions, sampler_settings, weights, progress_total }) {
  const result = db
    .prepare(
      `INSERT INTO model_eval_runs (status, mode, model_names, repetitions, sampler_settings, weights, progress_total)
       VALUES ('running', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      mode ?? 'auto',
      JSON.stringify(model_names ?? []),
      repetitions ?? 1,
      JSON.stringify(sampler_settings ?? {}),
      JSON.stringify(weights ?? {}),
      progress_total ?? 0,
    );
  return getRun(result.lastInsertRowid);
}

export function getRun(id) {
  return parseRun(db.prepare('SELECT * FROM model_eval_runs WHERE id = ?').get(id));
}

export function listRuns(limit = 30) {
  return db.prepare('SELECT * FROM model_eval_runs ORDER BY id DESC LIMIT ?').all(limit).map(parseRun);
}

export function updateRunProgress(id, { progress_done, current_label }) {
  db.prepare('UPDATE model_eval_runs SET progress_done = ?, current_label = ? WHERE id = ?').run(
    progress_done,
    current_label ?? '',
    id,
  );
}

export function finishRun(id, { status, error }) {
  db.prepare("UPDATE model_eval_runs SET status = ?, error = ?, finished_at = datetime('now') WHERE id = ?").run(
    status,
    error ?? '',
    id,
  );
  return getRun(id);
}

// ── 結果 ────────────────────────────────────────────────────
export function createResult({
  run_id, model_name, scenario_id, scenario_name, repetition, turn_index,
  user_message, raw_output, scores, latency_ms, prompt_tokens, output_chars,
}) {
  const result = db
    .prepare(
      `INSERT INTO model_eval_results
        (run_id, model_name, scenario_id, scenario_name, repetition, turn_index, user_message, raw_output, scores, latency_ms, prompt_tokens, output_chars)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      run_id,
      model_name,
      scenario_id ?? null,
      scenario_name ?? '',
      repetition ?? 1,
      turn_index,
      user_message ?? '',
      raw_output ?? '',
      JSON.stringify(scores ?? {}),
      latency_ms ?? null,
      prompt_tokens ?? null,
      output_chars ?? null,
    );
  return db.prepare('SELECT * FROM model_eval_results WHERE id = ?').get(result.lastInsertRowid);
}

export function listResultsForRun(runId) {
  return db
    .prepare('SELECT * FROM model_eval_results WHERE run_id = ? ORDER BY model_name ASC, scenario_id ASC, repetition ASC, turn_index ASC')
    .all(runId)
    .map(parseResult);
}

export function setManualScore(id, { manual_score, manual_note }) {
  db.prepare('UPDATE model_eval_results SET manual_score = ?, manual_note = ? WHERE id = ?').run(
    manual_score == null ? null : manual_score,
    manual_note ?? '',
    id,
  );
  return parseResult(db.prepare('SELECT * FROM model_eval_results WHERE id = ?').get(id));
}
