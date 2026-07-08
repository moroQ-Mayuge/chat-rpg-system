import { useState, useEffect } from 'react';
import {
  useSettingsStatus,
  useStylePresets,
  useStylePresetMutations,
  useImageFormats,
  useImageFormatMutations,
  useImageGenerationSettings,
  useImageGenerationSettingsMutations,
  useSamplers,
  useKoboldcppLaunchSettings,
  useKoboldcppLaunchSettingsMutations,
} from '../hooks/useSettings.js';
import { settingsApi } from '../api/settings.js';

const cardStyle = { background: '#f7f7f7', borderRadius: 12, padding: 16 };

function StatusRow({ label, modelName, connected }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 0',
        borderBottom: '1px solid #eee',
      }}
    >
      <div>
        <p style={{ fontSize: 13, margin: 0 }}>{label}</p>
        <p style={{ fontSize: 11, color: '#888', margin: '2px 0 0', fontFamily: 'monospace' }}>{modelName ?? '—'}</p>
      </div>
      <span
        style={{
          fontSize: 11,
          background: connected ? '#dcfce7' : '#fee2e2',
          color: connected ? '#166534' : '#991b1b',
          padding: '3px 10px',
          borderRadius: 12,
        }}
      >
        {connected ? '● 接続中' : '● 未接続'}
      </span>
    </div>
  );
}

const emptyPresetForm = { name: '', prompt_text: '', is_default: false };

function StylePresetsSection() {
  const { data: presets, isLoading } = useStylePresets();
  const { create, update, remove } = useStylePresetMutations();
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyPresetForm);

  function startEdit(preset) {
    setEditingId(preset.id);
    setForm({ name: preset.name, prompt_text: preset.prompt_text, is_default: Boolean(preset.is_default) });
  }

  function startCreate() {
    setEditingId('new');
    setForm(emptyPresetForm);
  }

  async function save() {
    if (editingId === 'new') {
      await create.mutateAsync(form);
    } else {
      await update.mutateAsync({ id: editingId, data: form });
    }
    setEditingId(null);
  }

  async function handleDelete(preset) {
    if (!window.confirm(`スタイルプリセット「${preset.name}」を削除しますか？`)) return;
    try {
      await remove.mutateAsync(preset.id);
    } catch (err) {
      window.alert(err.message);
    }
  }

  if (isLoading) return null;

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>画像スタイルプリセット</p>
        <button style={{ fontSize: 12 }} onClick={startCreate}>
          + 新規プリセット
        </button>
      </div>
      <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
        画風・品質タグなどをここに登録すると、全ての画像生成のプロンプト先頭に自動で付加されます。Worldごとに使うプリセットを選べます（未指定はデフォルトのプリセットを使用）。
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
        {presets.map((preset) => (
          <div
            key={preset.id}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', border: '1px solid #ddd', borderRadius: 6, padding: '6px 10px' }}
          >
            <div>
              <span style={{ fontSize: 13 }}>{preset.name}</span>
              {Boolean(preset.is_default) && (
                <span style={{ fontSize: 10, marginLeft: 6, background: '#dbeafe', padding: '1px 6px', borderRadius: 8 }}>既定</span>
              )}
              <p style={{ fontSize: 11, color: '#888', margin: '2px 0 0', fontFamily: 'monospace' }}>{preset.prompt_text || '(空)'}</p>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ fontSize: 11 }} onClick={() => startEdit(preset)}>
                編集
              </button>
              {!preset.is_default && (
                <button style={{ fontSize: 11 }} onClick={() => handleDelete(preset)}>
                  削除
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {editingId != null && (
        <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 6, padding: 10 }}>
          <label style={{ display: 'block', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: '#888' }}>プリセット名</span>
            <input style={{ display: 'block', width: '100%' }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label style={{ display: 'block', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: '#888' }}>プロンプト（画風・品質タグ・アーティスト名など）</span>
            <textarea
              style={{ display: 'block', width: '100%', height: 46, fontFamily: 'monospace', fontSize: 12 }}
              value={form.prompt_text}
              onChange={(e) => setForm({ ...form, prompt_text: e.target.value })}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12 }}>
            <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
            既定のプリセットにする（World未指定時に使われる）
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button onClick={() => setEditingId(null)}>キャンセル</button>
            <button onClick={save} disabled={!form.name}>
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const IMAGE_KIND_LABELS = {
  standing: '立ち絵',
  expression: '表情差分',
  scene: 'シーン画像',
  event: 'イベント画像',
  room_background: '部屋の背景',
  world_thumbnail: '世界の代表画像',
};

const IMAGE_KIND_PLACEHOLDERS = {
  standing: ['style_preset', 'character_tags', 'extra_hint'],
  expression: ['style_preset', 'character_tags', 'expression_tag', 'extra_hint'],
  scene: ['style_preset', 'location_tags', 'atmosphere_tags', 'prop_tags', 'character_tags', 'extra_hint'],
  event: ['style_preset', 'location_tags', 'atmosphere_tags', 'prop_tags', 'character_tags', 'extra_hint'],
  room_background: ['style_preset', 'location_tags', 'atmosphere_tags', 'extra_hint'],
  world_thumbnail: ['style_preset', 'world_tags', 'extra_hint'],
};

const MODE_LABELS = {
  anchor_i2i: '参照画像アンカー方式（i2i・キャラの見た目を維持しやすい）',
  prompt_only: 'プロンプトのみ（txt2img・毎回自由生成、破綻しにくい）',
};

const VARIABLE_DESCRIPTIONS = {
  style_preset: 'World（または既定）に設定されたスタイルプリセットの文言',
  character_tags: '対象キャラの衣装（Outfit）に設定されたdanbooruタグ',
  expression_tag: '表情マスターで設定した表情キー（例: smile, angry）',
  extra_hint: '生成時にその場で入力する自由記述のヒント',
  location_tags: '部屋テンプレートに設定された場所タグ',
  atmosphere_tags: 'シーンの雰囲気タグ（天候・時間帯の雰囲気など）',
  prop_tags: '部屋に配置された設備・小道具のdanbooruタグ',
  world_tags: 'World単位で設定されたイメージタグ',
};

// title属性でPCのホバー時にツールチップを出しつつ、タップでも同じ説明を
// インライン展開できるようにする（スマホはホバーが効かないため）。
function VariableHintChip({ name, active, onToggle }) {
  return (
    <span
      title={VARIABLE_DESCRIPTIONS[name] ?? ''}
      onClick={onToggle}
      style={{
        display: 'inline-block',
        cursor: 'pointer',
        background: active ? '#dbeafe' : '#f0f0f0',
        border: '1px solid #ddd',
        borderRadius: 10,
        padding: '1px 7px',
        fontSize: 10,
        fontFamily: 'monospace',
        marginRight: 4,
        marginBottom: 4,
      }}
    >
      {`\${${name}}`}
    </span>
  );
}

function ImageGenerationSettingRow({ setting }) {
  const { update } = useImageGenerationSettingsMutations();
  const { data: samplers } = useSamplers();
  const [form, setForm] = useState(setting);
  const [expanded, setExpanded] = useState(false);
  const [activeHint, setActiveHint] = useState(null);
  const [isTestGenerating, setIsTestGenerating] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState(null);

  useEffect(() => {
    setForm(setting);
  }, [setting]);

  const dirty = JSON.stringify(form) !== JSON.stringify(setting);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    await update.mutateAsync({
      kind: setting.image_kind,
      data: {
        default_mode: form.default_mode,
        prompt_template: form.prompt_template,
        negative_prompt: form.negative_prompt,
        anchor_width: Number(form.anchor_width),
        main_width: Number(form.main_width),
        main_height: Number(form.main_height),
        steps: Number(form.steps),
        cfg_scale: Number(form.cfg_scale),
        denoising_strength: Number(form.denoising_strength),
        sampler_name: form.sampler_name,
      },
    });
  }

  const samplerOptions = samplers?.includes(form.sampler_name) ? samplers : [form.sampler_name, ...(samplers ?? [])];

  async function testGenerate() {
    setIsTestGenerating(true);
    setTestError(null);
    try {
      const result = await settingsApi.testGenerateImageGenerationSettings(setting.image_kind, {
        default_mode: form.default_mode,
        prompt_template: form.prompt_template,
        negative_prompt: form.negative_prompt,
        anchor_width: Number(form.anchor_width),
        main_width: Number(form.main_width),
        main_height: Number(form.main_height),
        steps: Number(form.steps),
        cfg_scale: Number(form.cfg_scale),
        denoising_strength: Number(form.denoising_strength),
        sampler_name: form.sampler_name,
      });
      setTestResult(result);
    } catch (err) {
      setTestError(err.message);
    } finally {
      setIsTestGenerating(false);
    }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 6, padding: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpanded((e) => !e)}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{IMAGE_KIND_LABELS[setting.image_kind] ?? setting.image_kind}</span>
        <span style={{ fontSize: 11, color: '#888' }}>{expanded ? '閉じる ▲' : '編集 ▼'}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'block' }}>
            <span style={{ fontSize: 11, color: '#888' }}>生成方式（既定）</span>
            <select style={{ display: 'block', width: '100%' }} value={form.default_mode} onChange={(e) => set('default_mode', e.target.value)}>
              {Object.entries(MODE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'block' }}>
            <span style={{ fontSize: 11, color: '#888' }}>プロンプトテンプレート</span>
            <textarea
              style={{ display: 'block', width: '100%', height: 46, fontFamily: 'monospace', fontSize: 12 }}
              value={form.prompt_template}
              onChange={(e) => set('prompt_template', e.target.value)}
            />
            <div style={{ marginTop: 4 }}>
              <span style={{ fontSize: 10, color: '#aaa' }}>使用可能な変数（タップ/ホバーで説明）: </span>
              <div style={{ marginTop: 2 }}>
                {IMAGE_KIND_PLACEHOLDERS[setting.image_kind].map((k) => (
                  <VariableHintChip
                    key={k}
                    name={k}
                    active={activeHint === k}
                    onToggle={() => setActiveHint((h) => (h === k ? null : k))}
                  />
                ))}
              </div>
              {activeHint && (
                <p style={{ fontSize: 11, color: '#555', margin: '2px 0 0', background: '#f7f7f7', borderRadius: 4, padding: '4px 8px' }}>
                  <code>{`\${${activeHint}}`}</code>: {VARIABLE_DESCRIPTIONS[activeHint]}
                </p>
              )}
            </div>
          </label>

          <label style={{ display: 'block' }}>
            <span style={{ fontSize: 11, color: '#888' }}>ネガティブプロンプト</span>
            <textarea
              style={{ display: 'block', width: '100%', height: 32, fontFamily: 'monospace', fontSize: 12 }}
              value={form.negative_prompt}
              onChange={(e) => set('negative_prompt', e.target.value)}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            <label>
              <span style={{ fontSize: 11, color: '#888', display: 'block' }}>幅</span>
              <input type="number" style={{ width: '100%' }} value={form.main_width} onChange={(e) => set('main_width', e.target.value)} />
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#888', display: 'block' }}>高さ</span>
              <input type="number" style={{ width: '100%' }} value={form.main_height} onChange={(e) => set('main_height', e.target.value)} />
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#888', display: 'block' }}>アンカー幅（i2i用）</span>
              <input type="number" style={{ width: '100%' }} value={form.anchor_width} onChange={(e) => set('anchor_width', e.target.value)} />
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#888', display: 'block' }}>ステップ数</span>
              <input type="number" style={{ width: '100%' }} value={form.steps} onChange={(e) => set('steps', e.target.value)} />
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#888', display: 'block' }}>CFGスケール</span>
              <input type="number" step="0.1" style={{ width: '100%' }} value={form.cfg_scale} onChange={(e) => set('cfg_scale', e.target.value)} />
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#888', display: 'block' }}>サンプラー</span>
              <select style={{ width: '100%' }} value={form.sampler_name} onChange={(e) => set('sampler_name', e.target.value)}>
                {samplerOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#888', display: 'block' }}>ノイズ除去強度（i2i用）</span>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                style={{ width: '100%' }}
                value={form.denoising_strength}
                onChange={(e) => set('denoising_strength', e.target.value)}
              />
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={testGenerate} disabled={isTestGenerating}>
              {isTestGenerating ? 'テスト生成中...' : 'この設定でテスト生成'}
            </button>
            <button onClick={save} disabled={!dirty || update.isPending}>
              {update.isPending ? '保存中...' : '保存'}
            </button>
          </div>

          {testError && <p style={{ color: 'red', fontSize: 11 }}>エラー: {testError}</p>}

          {testResult && (
            <div style={{ borderTop: '1px solid #eee', paddingTop: 8 }}>
              <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
                テスト結果（サンプルデータ使用・保存されません{testResult.usedMode !== form.default_mode && ` / 実際の生成方式: ${MODE_LABELS[testResult.usedMode]}`}）
              </p>
              <img src={testResult.imagePath} alt="テスト生成結果" style={{ maxWidth: '100%', borderRadius: 6, marginBottom: 6 }} />
              <p style={{ fontSize: 10, color: '#aaa', fontFamily: 'monospace', wordBreak: 'break-all' }}>{testResult.prompt}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ImageGenerationSettingsSection() {
  const { data: settings, isLoading } = useImageGenerationSettings();

  if (isLoading) return null;

  return (
    <div style={cardStyle}>
      <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 8px' }}>画像生成の詳細設定</p>
      <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
        画像の種類ごとに生成方式・プロンプトテンプレート・キャンバスサイズ・SDパラメータを設定します。
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {settings.map((s) => (
          <ImageGenerationSettingRow key={s.image_kind} setting={s} />
        ))}
      </div>
    </div>
  );
}

function ImageFormatSection() {
  const { data: formats, isLoading } = useImageFormats();
  const { set } = useImageFormatMutations();

  if (isLoading) return null;

  return (
    <div style={cardStyle}>
      <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 8px' }}>出力画像形式</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {formats.map((f) => (
          <div key={f.image_kind} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>{IMAGE_KIND_LABELS[f.image_kind] ?? f.image_kind}</span>
            <select value={f.format} onChange={(e) => set.mutate({ kind: f.image_kind, format: e.target.value })}>
              <option value="png">PNG</option>
              <option value="jpg">JPG</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

function TestGenerateSection() {
  const { data: presets } = useStylePresets();
  const [prompt, setPrompt] = useState('');
  const [width, setWidth] = useState(832);
  const [height, setHeight] = useState(1216);
  const [format, setFormat] = useState('png');
  const [stylePresetId, setStylePresetId] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await settingsApi.testGenerateImage({
        prompt: prompt.trim(),
        width,
        height,
        format,
        style_preset_id: stylePresetId || undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div style={cardStyle}>
      <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 8px' }}>画像生成テスト</p>
      <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
        キャラや部屋に紐づかない単発の画像生成です。プロンプトやスタイルプリセットの効果を手早く確認できます。
      </p>

      <textarea
        style={{ width: '100%', height: 46, fontFamily: 'monospace', fontSize: 12, marginBottom: 8 }}
        placeholder="1girl, solo, school uniform, smile"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 8 }}>
        <label>
          <span style={{ fontSize: 11, color: '#888', display: 'block' }}>幅</span>
          <input type="number" style={{ width: '100%' }} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
        </label>
        <label>
          <span style={{ fontSize: 11, color: '#888', display: 'block' }}>高さ</span>
          <input type="number" style={{ width: '100%' }} value={height} onChange={(e) => setHeight(Number(e.target.value))} />
        </label>
        <label>
          <span style={{ fontSize: 11, color: '#888', display: 'block' }}>形式</span>
          <select style={{ width: '100%' }} value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
          </select>
        </label>
        <label>
          <span style={{ fontSize: 11, color: '#888', display: 'block' }}>スタイルプリセット</span>
          <select style={{ width: '100%' }} value={stylePresetId} onChange={(e) => setStylePresetId(e.target.value)}>
            <option value="">既定を使用</option>
            {(presets ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button onClick={handleGenerate} disabled={!prompt.trim() || isGenerating}>
          {isGenerating ? '生成中...' : '生成'}
        </button>
      </div>

      {error && <p style={{ color: 'red', fontSize: 12 }}>エラー: {error}</p>}

      {result && (
        <div>
          <img src={result.imagePath} alt="テスト生成結果" style={{ maxWidth: '100%', borderRadius: 6, marginBottom: 6 }} />
          <p style={{ fontSize: 11, color: '#888', fontFamily: 'monospace', wordBreak: 'break-all' }}>{result.prompt}</p>
        </div>
      )}
    </div>
  );
}

function KoboldcppLaunchSettingsSection() {
  const { data: launchSettings } = useKoboldcppLaunchSettings();
  const { update } = useKoboldcppLaunchSettingsMutations();
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (launchSettings) setForm(launchSettings);
  }, [launchSettings]);

  if (!form) return null;

  const dirty = JSON.stringify(form) !== JSON.stringify(launchSettings);

  return (
    <div style={{ marginTop: 8 }}>
      <label style={{ display: 'block' }}>
        <span style={{ fontSize: 11, color: '#888', display: 'block' }}>画像生成モデルの量子化ロード（fp8非対応のため代替）</span>
        <select value={form.sd_quant} onChange={(e) => setForm({ ...form, sd_quant: Number(e.target.value) })}>
          <option value={0}>オフ（フル精度）</option>
          <option value={1}>q8（軽量化）</option>
          <option value={2}>q4（さらに軽量化）</option>
        </select>
        <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
          KoboldCppにfp8ロードは無く、対応しているのはこのq8/q4量子化のみです。
        </p>
      </label>

      <label style={{ display: 'block', marginTop: 8 }}>
        <span style={{ fontSize: 11, color: '#888', display: 'block' }}>テキストモデルのパス（任意）</span>
        <input
          style={{ width: '100%' }}
          placeholder="空欄ならmodels/llm内の最初のファイルを自動使用"
          value={form.llm_model_path ?? ''}
          onChange={(e) => setForm({ ...form, llm_model_path: e.target.value })}
        />
      </label>

      <label style={{ display: 'block', marginTop: 8 }}>
        <span style={{ fontSize: 11, color: '#888', display: 'block' }}>画像生成モデルのパス（任意）</span>
        <input
          style={{ width: '100%' }}
          placeholder="空欄ならmodels/sd内の最初のファイルを自動使用"
          value={form.sd_model_path ?? ''}
          onChange={(e) => setForm({ ...form, sd_model_path: e.target.value })}
        />
      </label>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={() => update.mutate(form)} disabled={!dirty || update.isPending}>
          {update.isPending ? '保存中...' : '保存'}
        </button>
      </div>
      <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>次回「KoboldCppを起動」時から反映されます。</p>
    </div>
  );
}

function StartKoboldcppButton({ onStarted }) {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState(null);

  async function handleStart() {
    setIsStarting(true);
    setError(null);
    try {
      await settingsApi.startKoboldcpp();
      onStarted();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={handleStart} disabled={isStarting}>
        {isStarting ? '起動しています...' : 'KoboldCppを起動'}
      </button>
      <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
        ChatRPGサーバーと同じPC上でkoboldcpp.exeを起動します（モデル読み込みに数十秒〜数分かかります）。
      </p>
      <KoboldcppLaunchSettingsSection />
      {error && <p style={{ color: 'red', fontSize: 11, marginTop: 4 }}>エラー: {error}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const { data: status, isLoading, refetch, isFetching } = useSettingsStatus();

  return (
    <div style={{ maxWidth: 640 }}>
      <h2>設定</h2>

      {isLoading && <p>読み込み中...</p>}

      {status && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(!status.textModel.connected || !status.sdModel.connected) && (
            <div style={{ background: '#fee2e2', borderRadius: 12, padding: '10px 16px' }}>
              <p style={{ fontSize: 12, color: '#991b1b', margin: 0 }}>
                KoboldCppに接続できません。koboldcpp.exeが起動しているか確認してください。
              </p>
            </div>
          )}

          <div style={cardStyle}>
            <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 4px' }}>KoboldCpp接続状況</p>

            <StatusRow label="テキストモデル" modelName={status.textModel.modelName} connected={status.textModel.connected} />
            <StatusRow label="画像生成モデル (SD)" modelName={status.sdModel.modelName} connected={status.sdModel.connected} />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid #eee',
              }}
            >
              <p style={{ fontSize: 11, color: '#888', margin: 0 }}>接続先: {status.koboldBaseUrl}</p>
              <button onClick={() => refetch()} disabled={isFetching}>
                {isFetching ? '確認中...' : '再確認'}
              </button>
            </div>

            {!status.textModel.connected && (
              <StartKoboldcppButton onStarted={() => setTimeout(refetch, 3000)} />
            )}
          </div>

          <div style={cardStyle}>
            <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 8px' }}>LANからのアクセス</p>
            <p style={{ fontSize: 12, color: '#555', margin: '0 0 8px' }}>
              同じネットワーク内のスマホ・タブレットから、以下のURLでアクセスできます。
            </p>
            {status.lanAddresses.length === 0 && <p style={{ fontSize: 12, color: '#888' }}>LAN上のアドレスが見つかりませんでした。</p>}
            {status.lanAddresses.map((addr) => {
              const port = window.location.port ? `:${window.location.port}` : '';
              return (
                <div
                  key={addr}
                  style={{
                    background: '#fff',
                    border: '1px solid #ddd',
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontFamily: 'monospace',
                    fontSize: 13,
                    marginBottom: 6,
                  }}
                >
                  {window.location.protocol}//{addr}
                  {port}
                </div>
              );
            })}
          </div>

          <StylePresetsSection />
          <ImageFormatSection />
          <ImageGenerationSettingsSection />
          <TestGenerateSection />
        </div>
      )}
    </div>
  );
}
