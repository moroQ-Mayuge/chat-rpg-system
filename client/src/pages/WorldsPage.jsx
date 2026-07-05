import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorlds, useWorldMutations } from '../hooks/useWorlds.js';
import { useStylePresets } from '../hooks/useSettings.js';
import TagChips from '../components/ui/TagChips.jsx';

const emptyForm = {
  name: '',
  worldview: '',
  time_slot_labels: ['朝', '昼', '放課後', '夜'],
  weather_options: ['晴れ', '曇り', '雨'],
  season_labels: ['春', '夏', '秋', '冬'],
  days_per_season: 30,
  image_style_preset_id: null,
};

export default function WorldsPage() {
  const { data: worlds, isLoading } = useWorlds();
  const { data: stylePresets } = useStylePresets();
  const { create, update, remove } = useWorldMutations();
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (editingId == null || !worlds) return;
    const world = worlds.find((w) => w.id === editingId);
    if (world) {
      setForm({
        name: world.name,
        worldview: world.worldview,
        time_slot_labels: world.time_slot_labels,
        weather_options: world.weather_options,
        season_labels: world.season_labels,
        days_per_season: world.days_per_season,
        image_style_preset_id: world.image_style_preset_id ?? null,
      });
    }
  }, [editingId, worlds]);

  function startCreate() {
    setEditingId('new');
    setForm(emptyForm);
  }

  function startEdit(world) {
    setEditingId(world.id);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function save() {
    if (editingId === 'new') {
      await create.mutateAsync(form);
    } else {
      await update.mutateAsync({ id: editingId, data: form });
    }
    cancelEdit();
  }

  async function handleDelete(world) {
    if (world.is_unassigned_bucket) return;
    if (!window.confirm(`「${world.name}」を削除しますか？`)) return;
    await remove.mutateAsync(world.id);
    if (editingId === world.id) cancelEdit();
  }

  if (isLoading) return <p>読み込み中...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>世界観一覧</h2>
        <button onClick={startCreate}>+ 新規世界観</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {worlds.map((world) => (
          <div
            key={world.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 8,
              border: '1px solid #ddd',
              borderRadius: 6,
              opacity: world.is_unassigned_bucket ? 0.7 : 1,
            }}
          >
            <span>
              {world.name}
              {world.is_unassigned_bucket && (
                <span style={{ fontSize: 11, marginLeft: 8, color: '#888' }}>削除不可</span>
              )}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link to={`/worlds/${world.id}/playthroughs`}>
                <button>ルート一覧</button>
              </Link>
              {!world.is_unassigned_bucket && (
                <>
                  <button onClick={() => startEdit(world)}>編集</button>
                  <button onClick={() => handleDelete(world)}>削除</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {editingId != null && (
        <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
          <p style={{ fontWeight: 500 }}>{editingId === 'new' ? '新規世界観' : '世界観を編集'}</p>

          <label style={{ display: 'block', marginBottom: 8 }}>
            名前
            <input
              style={{ display: 'block', width: '100%' }}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 8 }}>
            基本世界観
            <textarea
              style={{ display: 'block', width: '100%', height: 60 }}
              value={form.worldview}
              onChange={(e) => setForm({ ...form, worldview: e.target.value })}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 8 }}>
            画像スタイルプリセット
            <select
              style={{ display: 'block', width: '100%' }}
              value={form.image_style_preset_id ?? ''}
              onChange={(e) => setForm({ ...form, image_style_preset_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">既定のプリセットを使用</option>
              {(stylePresets ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <div style={{ borderTop: '1px solid #ddd', paddingTop: 10, marginTop: 10 }}>
            <p style={{ fontWeight: 500 }}>暦設定（このWorldの全ルート共通ルール）</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <p>時間帯ラベル（順序付き）</p>
                <TagChips
                  tags={form.time_slot_labels}
                  onChange={(tags) => setForm({ ...form, time_slot_labels: tags })}
                  placeholder="+ 時間帯を追加"
                />
              </div>
              <div>
                <p>天候候補</p>
                <TagChips
                  tags={form.weather_options}
                  onChange={(tags) => setForm({ ...form, weather_options: tags })}
                  placeholder="+ 天候を追加"
                />
              </div>
              <div>
                <p>季節ラベル（順序付き）</p>
                <TagChips
                  tags={form.season_labels}
                  onChange={(tags) => setForm({ ...form, season_labels: tags })}
                  placeholder="+ 季節を追加"
                />
              </div>
              <div>
                <p>季節が切り替わる日数間隔</p>
                <input
                  type="number"
                  min="1"
                  value={form.days_per_season}
                  onChange={(e) => setForm({ ...form, days_per_season: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button onClick={cancelEdit}>キャンセル</button>
            <button onClick={save} disabled={!form.name}>
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
