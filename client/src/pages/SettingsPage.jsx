import { useState } from 'react';
import {
  useSettingsStatus,
  useStylePresets,
  useStylePresetMutations,
  useImageFormats,
  useImageFormatMutations,
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
};

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
          <TestGenerateSection />
        </div>
      )}
    </div>
  );
}
