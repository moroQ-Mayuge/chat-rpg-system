import { useEffect, useState } from 'react';
import {
  useEvalCriteria, useEvalScenarios, useEvalScenarioMutations,
  useEvalRuns, useEvalRun, useEvalResults, useEvalRunMutations,
} from '../hooks/useModelEvals.js';
import { useKoboldcppModelFiles } from '../hooks/useSettings.js';
import { useMobileListToggle } from '../hooks/useMobileListToggle.js';

// スコア0..1を色付きで表示する。低いほど赤くなるので、比較表を眺めた時に
// どのモデルがどの軸で崩れているかが一目で分かる。
function ScoreCell({ value }) {
  if (value == null) return <span style={{ color: '#bbb' }}>—</span>;
  const hue = Math.round(value * 120); // 0=赤, 120=緑
  return (
    <span style={{ color: `hsl(${hue}, 70%, 35%)`, fontWeight: value < 0.6 ? 600 : 400 }}>
      {value.toFixed(2)}
    </span>
  );
}

function RunProgress({ runId, onCancel }) {
  const { data } = useEvalRun(runId);
  if (!data) return null;
  const { run } = data;
  const pct = run.progress_total > 0 ? Math.round((run.progress_done / run.progress_total) * 100) : 0;

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          実行 #{run.id}（{run.status === 'running' ? '実行中' : run.status === 'completed' ? '完了' : run.status === 'cancelled' ? '中断' : '失敗'}）
        </span>
        {run.status === 'running' && (
          <button type="button" onClick={() => onCancel(run.id)}>
            中断
          </button>
        )}
      </div>
      <div style={{ background: '#eee', borderRadius: 4, height: 8, marginTop: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, background: '#3b82f6', height: '100%', transition: 'width .3s' }} />
      </div>
      <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
        {run.progress_done} / {run.progress_total} ターン（{pct}%）
        {run.current_label && ` — ${run.current_label}`}
      </p>
      {run.error && <p style={{ fontSize: 11, color: '#b91c1c', margin: '4px 0 0' }}>エラー: {run.error}</p>}
    </div>
  );
}

function ComparisonTable({ runId }) {
  const { data } = useEvalRun(runId);
  const { data: criteria } = useEvalCriteria();
  if (!data || !criteria) return null;
  const { summary, weights } = data;
  if (summary.length === 0) return <p style={{ fontSize: 12, color: '#888' }}>まだ結果がありません。</p>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 480 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '2px solid #ddd' }}>評価軸</th>
            <th style={{ padding: '4px 8px', borderBottom: '2px solid #ddd', color: '#888', fontWeight: 400 }}>重み</th>
            {summary.map((s) => (
              <th key={s.model_name} style={{ padding: '4px 8px', borderBottom: '2px solid #ddd', textAlign: 'right' }}>
                {s.model_name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {criteria.map((c) => (
            <tr key={c.key}>
              <td style={{ padding: '3px 8px', whiteSpace: 'nowrap' }}>{c.label}</td>
              <td style={{ padding: '3px 8px', textAlign: 'center', color: '#888' }}>
                {weights?.[c.key] ?? c.default_weight}
              </td>
              {summary.map((s) => (
                <td key={s.model_name} style={{ padding: '3px 8px', textAlign: 'right' }}>
                  <ScoreCell value={s.criteria[c.key]} />
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td style={{ padding: '6px 8px', borderTop: '2px solid #ddd', fontWeight: 600 }}>総合スコア</td>
            <td style={{ borderTop: '2px solid #ddd' }} />
            {summary.map((s) => (
              <td key={s.model_name} style={{ padding: '6px 8px', borderTop: '2px solid #ddd', textAlign: 'right', fontWeight: 600 }}>
                <ScoreCell value={s.total} />
              </td>
            ))}
          </tr>
          <tr>
            <td style={{ padding: '3px 8px', color: '#888' }}>手動レビュー平均（1〜5）</td>
            <td />
            {summary.map((s) => (
              <td key={s.model_name} style={{ padding: '3px 8px', textAlign: 'right', color: '#888' }}>
                {s.manual_average != null ? `${s.manual_average.toFixed(1)}（${s.manual_count}件）` : '—'}
              </td>
            ))}
          </tr>
          <tr>
            <td style={{ padding: '3px 8px', color: '#888' }}>平均応答時間</td>
            <td />
            {summary.map((s) => (
              <td key={s.model_name} style={{ padding: '3px 8px', textAlign: 'right', color: '#888' }}>
                {s.avg_latency_ms != null ? `${(s.avg_latency_ms / 1000).toFixed(1)}秒` : '—'}
              </td>
            ))}
          </tr>
          <tr>
            <td style={{ padding: '3px 8px', color: '#888' }}>サンプル数</td>
            <td />
            {summary.map((s) => (
              <td key={s.model_name} style={{ padding: '3px 8px', textAlign: 'right', color: '#888' }}>
                {s.sample_count}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ResultRow({ result, criteria, runId }) {
  const { setManualScore } = useEvalRunMutations();
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(result.manual_score ?? '');
  const [note, setNote] = useState(result.manual_note ?? '');

  const lowScores = criteria
    .map((c) => ({ ...c, entry: result.scores?.[c.key] }))
    .filter((c) => c.entry && c.entry.score < 1);

  return (
    <div style={{ border: '1px solid #eee', borderRadius: 6, padding: 8, marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12 }}>
          <strong>{result.model_name}</strong> / {result.scenario_name}
          <span style={{ color: '#888' }}> ({result.repetition}回目・ターン{result.turn_index + 1})</span>
        </span>
        <button type="button" style={{ fontSize: 11 }} onClick={() => setOpen(!open)}>
          {open ? '閉じる' : '詳細'}
        </button>
      </div>
      {lowScores.length > 0 && (
        <p style={{ fontSize: 11, color: '#b45309', margin: '4px 0 0' }}>
          減点: {lowScores.map((c) => `${c.label} ${c.entry.score.toFixed(2)}`).join(' / ')}
        </p>
      )}
      {open && (
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 11, color: '#888', margin: '0 0 2px' }}>ユーザー発言</p>
          <p style={{ fontSize: 12, margin: '0 0 6px' }}>{result.user_message}</p>
          <p style={{ fontSize: 11, color: '#888', margin: '0 0 2px' }}>モデル出力</p>
          <textarea readOnly value={result.raw_output} style={{ width: '100%', height: 120, fontSize: 11, fontFamily: 'monospace' }} />
          <p style={{ fontSize: 11, color: '#888', margin: '6px 0 2px' }}>採点内訳</p>
          <ul style={{ fontSize: 11, margin: 0, paddingLeft: 18 }}>
            {criteria.map((c) => {
              const entry = result.scores?.[c.key];
              if (!entry) return null;
              return (
                <li key={c.key} style={{ color: entry.score < 1 ? '#b45309' : '#555' }}>
                  {c.label}: {entry.score.toFixed(2)} — {entry.detail}
                </li>
              );
            })}
          </ul>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 11, color: '#888' }}>手動スコア</span>
            <select value={score} onChange={(e) => setScore(e.target.value)} style={{ fontSize: 11 }}>
              <option value="">未評価</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <input
              style={{ flex: 1, fontSize: 11 }}
              placeholder="メモ（任意）"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              type="button"
              style={{ fontSize: 11 }}
              onClick={() =>
                setManualScore.mutate({
                  resultId: result.id,
                  runId,
                  data: { manual_score: score === '' ? null : Number(score), manual_note: note },
                })
              }
            >
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ModelEvalPage() {
  const { mobileListOpen, openList, closeList } = useMobileListToggle();
  const { data: scenarios } = useEvalScenarios();
  const { data: modelFiles } = useKoboldcppModelFiles();
  const { data: runsData } = useEvalRuns();
  const { data: criteria } = useEvalCriteria();
  const { start, cancel } = useEvalRunMutations();

  const [selectedRunId, setSelectedRunId] = useState(null);
  const [selectedScenarioIds, setSelectedScenarioIds] = useState([]);
  const [selectedModels, setSelectedModels] = useState([]);
  const [repetitions, setRepetitions] = useState(1);
  const [mode, setMode] = useState('current');
  const [startError, setStartError] = useState(null);
  const { data: results } = useEvalResults(selectedRunId);

  // 既定で全シナリオを対象にする
  useEffect(() => {
    if (scenarios && selectedScenarioIds.length === 0) {
      setSelectedScenarioIds(scenarios.filter((s) => s.enabled).map((s) => s.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarios]);

  // 実行中のrunがあれば自動で選択して進捗を映す
  useEffect(() => {
    if (runsData?.active_run_id) setSelectedRunId(runsData.active_run_id);
    else if (selectedRunId == null && runsData?.runs?.length) setSelectedRunId(runsData.runs[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runsData]);

  function toggle(list, setList, value) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function handleStart() {
    setStartError(null);
    try {
      const run = await start.mutateAsync({
        scenario_ids: selectedScenarioIds,
        model_filenames: selectedModels,
        repetitions: Number(repetitions) || 1,
        mode,
      });
      setSelectedRunId(run.id);
    } catch (err) {
      setStartError(err.message);
    }
  }

  if (!scenarios || !criteria) return <p>読み込み中...</p>;

  const turnTotal = scenarios
    .filter((s) => selectedScenarioIds.includes(s.id))
    .reduce((sum, s) => sum + s.turns.length, 0);
  const modelCount = mode === 'current' ? 1 : selectedModels.length;
  const estimatedTurns = turnTotal * (Number(repetitions) || 1) * Math.max(modelCount, 1);

  return (
    <div>
      <h2>モデル評価</h2>
      <p style={{ fontSize: 12, color: '#555', maxWidth: 820 }}>
        台本化した会話シナリオを同じ条件で各モデルに流し、出力を機械的に採点して比較します。
        採点は全て決定的なルール（タグ解析・キーワード照合・正規表現）で行うため、同じ出力からは必ず同じスコアが出ます。
        主観的な良し悪しは、各結果の「手動スコア」で別途記録できます。
      </p>

      <div className={`sidebar-layout${mobileListOpen ? ' mobile-list-open' : ''}`} style={{ '--sidebar-width': '260px' }}>
        <div className="sidebar-pane">
          <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 6px' }}>実行設定</p>

          <p style={{ fontSize: 11, color: '#888', margin: '8px 0 2px' }}>モデルの切り替え</p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input type="radio" checked={mode === 'current'} onChange={() => setMode('current')} />
            今ロード中のモデルだけ
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input type="radio" checked={mode === 'auto'} onChange={() => setMode('auto')} />
            選んだモデルを自動で切り替え
          </label>
          {mode === 'auto' && (
            <p style={{ fontSize: 11, color: '#b45309', margin: '4px 0 0' }}>
              ⚠ 実行中はKoboldCppを繰り返し再起動します。手動で起動した分も終了されます。
            </p>
          )}

          {mode === 'auto' && (
            <>
              <p style={{ fontSize: 11, color: '#888', margin: '8px 0 2px' }}>対象モデル</p>
              {(modelFiles?.llm ?? []).map((f) => (
                <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <input
                    type="checkbox"
                    checked={selectedModels.includes(f)}
                    onChange={() => toggle(selectedModels, setSelectedModels, f)}
                  />
                  <span style={{ wordBreak: 'break-all' }}>{f}</span>
                </label>
              ))}
              {(modelFiles?.llm ?? []).length === 0 && (
                <p style={{ fontSize: 11, color: '#888' }}>koboldcpp/models/llm/ にモデルがありません</p>
              )}
            </>
          )}

          <p style={{ fontSize: 11, color: '#888', margin: '10px 0 2px' }}>シナリオ</p>
          {scenarios.map((s) => (
            <label key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, marginBottom: 2 }}>
              <input
                type="checkbox"
                checked={selectedScenarioIds.includes(s.id)}
                onChange={() => toggle(selectedScenarioIds, setSelectedScenarioIds, s.id)}
              />
              <span>
                {s.name}
                <span style={{ color: '#888' }}>（{s.turns.length}ターン）</span>
              </span>
            </label>
          ))}

          <label style={{ display: 'block', marginTop: 10 }}>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>同じシナリオの試行回数</span>
            <input
              type="number"
              min="1"
              max="10"
              style={{ width: 70 }}
              value={repetitions}
              onChange={(e) => setRepetitions(e.target.value)}
            />
            <span style={{ fontSize: 11, color: '#888', marginLeft: 6 }}>回</span>
          </label>
          <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
            出力にはばらつきがあるため、2〜3回にすると安定します。合計 {estimatedTurns} ターン生成します。
          </p>

          <button
            style={{ width: '100%', marginTop: 10 }}
            onClick={handleStart}
            disabled={start.isPending || selectedScenarioIds.length === 0 || (mode === 'auto' && selectedModels.length === 0)}
          >
            {start.isPending ? '開始中...' : '評価を実行'}
          </button>
          {startError && <p style={{ fontSize: 11, color: '#b91c1c', marginTop: 4 }}>エラー: {startError}</p>}

          <p style={{ fontSize: 11, color: '#888', margin: '14px 0 4px' }}>過去の実行</p>
          {(runsData?.runs ?? []).map((r) => (
            <div
              key={r.id}
              onClick={() => setSelectedRunId(r.id)}
              style={{
                padding: 4,
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
                background: selectedRunId === r.id ? '#dbeafe' : 'transparent',
              }}
            >
              #{r.id} {r.started_at?.slice(5, 16)}（{r.status}）
            </div>
          ))}
        </div>

        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
          <button className="mobile-list-toggle" onClick={openList}>
            ☰ 実行設定を表示
          </button>

          {selectedRunId == null && <p style={{ fontSize: 12, color: '#888' }}>左の設定から評価を実行してください。</p>}

          {selectedRunId != null && (
            <>
              <RunProgress runId={selectedRunId} onCancel={(id) => cancel.mutate(id)} />

              <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 6px' }}>モデル比較</p>
              <ComparisonTable runId={selectedRunId} />

              <p style={{ fontSize: 13, fontWeight: 500, margin: '16px 0 6px' }}>
                出力レビュー（{results?.length ?? 0}件）
              </p>
              <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
                自動採点で減点された箇所が上部に出ます。生出力を読んで主観的な良し悪しを1〜5で記録できます。
              </p>
              {(results ?? []).map((r) => (
                <ResultRow key={r.id} result={r} criteria={criteria} runId={selectedRunId} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
