import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorlds, useWorldMutations } from '../hooks/useWorlds.js';
import { useStylePresets } from '../hooks/useSettings.js';
import TagChips from '../components/ui/TagChips.jsx';
import DanbooruTagEditor from '../components/ui/DanbooruTagEditor.jsx';

const emptyForm = {
  name: '',
  worldview: '',
  time_slot_labels: ['朝', '昼', '放課後', '夜'],
  weather_options: ['晴れ', '曇り', '雨'],
  season_labels: ['春', '夏', '秋', '冬'],
  days_per_season: 30,
  image_style_preset_id: null,
  image_tags: '',
  protagonist_name: '',
  protagonist_nickname: '',
  protagonist_occupation: '',
  protagonist_appearance: '',
  protagonist_gender: '',
  protagonist_notes: '',
  protagonist_mode: 'character',
  attribute_tags: '',
  movement_points_per_time_slot: 4,
  max_response_tokens: '',
};

export default function WorldsPage() {
  const { data: worlds, isLoading } = useWorlds();
  const { data: stylePresets } = useStylePresets();
  const { create, update, remove, uploadThumbnailImage, generateThumbnailImage } = useWorldMutations();
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [thumbGenerating, setThumbGenerating] = useState(false);
  const [thumbGenerateError, setThumbGenerateError] = useState(null);

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
        image_tags: world.image_tags ?? '',
        thumbnail_image_path: world.thumbnail_image_path,
        protagonist_name: world.protagonist_name ?? '',
        protagonist_nickname: world.protagonist_nickname ?? '',
        protagonist_occupation: world.protagonist_occupation ?? '',
        protagonist_appearance: world.protagonist_appearance ?? '',
        protagonist_gender: world.protagonist_gender ?? '',
        protagonist_notes: world.protagonist_notes ?? '',
        protagonist_mode: world.protagonist_mode ?? 'character',
        attribute_tags: world.attribute_tags ?? '',
        movement_points_per_time_slot: world.movement_points_per_time_slot ?? 4,
        max_response_tokens: world.max_response_tokens ?? '',
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
    const payload = {
      ...form,
      max_response_tokens: form.max_response_tokens === '' ? null : Number(form.max_response_tokens),
    };
    if (editingId === 'new') {
      await create.mutateAsync(payload);
    } else {
      await update.mutateAsync({ id: editingId, data: payload });
    }
    cancelEdit();
  }

  async function handleDelete(world) {
    if (world.is_unassigned_bucket) return;
    if (!window.confirm(`「${world.name}」を削除しますか？`)) return;
    await remove.mutateAsync(world.id);
    if (editingId === world.id) cancelEdit();
  }

  async function handleThumbnailUpload(e) {
    const file = e.target.files[0];
    if (!file || editingId === 'new') return;
    await uploadThumbnailImage.mutateAsync({ id: editingId, file });
  }

  async function handleGenerateThumbnail() {
    if (editingId === 'new') return;
    setThumbGenerating(true);
    setThumbGenerateError(null);
    try {
      await generateThumbnailImage.mutateAsync({ id: editingId });
    } catch (err) {
      setThumbGenerateError(err.message);
    } finally {
      setThumbGenerating(false);
    }
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 56,
                  height: 32,
                  borderRadius: 4,
                  flexShrink: 0,
                  background: world.thumbnail_image_path ? `url(${world.thumbnail_image_path}) center/cover` : '#eee',
                }}
              />
              <span>
                {world.name}
                {world.is_unassigned_bucket && (
                  <span style={{ fontSize: 11, marginLeft: 8, color: '#888' }}>削除不可</span>
                )}
              </span>
            </div>
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

          <div style={{ marginBottom: 8 }}>
            <p style={{ marginBottom: 4 }}>代表画像（一覧のサムネイルなどに使用）</p>
            <div
              style={{
                width: 200,
                aspectRatio: '16 / 9',
                background: form.thumbnail_image_path ? `url(${form.thumbnail_image_path}) center/cover` : '#eee',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#999',
                fontSize: 12,
                marginBottom: 6,
              }}
            >
              {!form.thumbnail_image_path && '未設定'}
            </div>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>画像生成用danbooruタグ</p>
            <DanbooruTagEditor value={form.image_tags} onChange={(v) => setForm({ ...form, image_tags: v })} />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <label style={{ flex: 1 }}>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleThumbnailUpload}
                  disabled={editingId === 'new'}
                />
                <span
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    border: '1px solid #ccc',
                    borderRadius: 6,
                    padding: 6,
                    cursor: editingId === 'new' ? 'not-allowed' : 'pointer',
                  }}
                >
                  アップロード{editingId === 'new' && '（先に保存してください）'}
                </span>
              </label>
              <button style={{ flex: 1 }} onClick={handleGenerateThumbnail} disabled={editingId === 'new' || thumbGenerating}>
                {thumbGenerating ? '生成中...' : 'AIで生成'}
              </button>
            </div>
            {thumbGenerateError && <p style={{ color: 'red', fontSize: 11, marginTop: 4 }}>エラー: {thumbGenerateError}</p>}
          </div>

          <div style={{ borderTop: '1px solid #ddd', paddingTop: 10, marginTop: 10 }}>
            <p style={{ fontWeight: 500 }}>属性キー</p>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
              ここに設定したキーとキャラクターの属性キーが一致すると、そのキャラはこのWorldに自動登場できる対象になります
            </p>
            <TagChips
              tags={(form.attribute_tags || '').split(',').map((t) => t.trim()).filter(Boolean)}
              onChange={(tags) => setForm({ ...form, attribute_tags: tags.join(', ') })}
              placeholder="例: 学園, 現代"
            />
          </div>

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
              <div>
                <p>時間帯ごとの移動サブカウント上限</p>
                <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
                  「場所」間の移動で消費する合計カウントがこの値に達すると、時間帯が1つ進みます
                </p>
                <input
                  type="number"
                  min="1"
                  value={form.movement_points_per_time_slot}
                  onChange={(e) => setForm({ ...form, movement_points_per_time_slot: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #ddd', paddingTop: 10, marginTop: 10 }}>
            <p style={{ fontWeight: 500 }}>応答生成設定</p>
            <p>応答の最大長さ（トークン数）</p>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
              空欄で既定値（512）を使用。キャラクター応答が短すぎる場合はここで増やせます
            </p>
            <input
              type="number"
              min="1"
              placeholder="既定（512）"
              value={form.max_response_tokens}
              onChange={(e) => setForm({ ...form, max_response_tokens: e.target.value })}
            />
          </div>

          <div style={{ borderTop: '1px solid #ddd', paddingTop: 10, marginTop: 10 }}>
            <p style={{ fontWeight: 500 }}>主人公（あなた）設定（このWorldの既定値。ルートごとに上書き可能）</p>

            <label style={{ display: 'block', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#888', display: 'block' }}>ユーザーの立ち位置</span>
              <select
                style={{ width: '100%' }}
                value={form.protagonist_mode}
                onChange={(e) => setForm({ ...form, protagonist_mode: e.target.value })}
              >
                <option value="character">登場人物として参加する</option>
                <option value="narrator">ナレーター／神視点（登場人物ではなく場面を直接指示する）</option>
              </select>
            </label>

            {form.protagonist_mode === 'character' && (
              <>
                <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
                  性格・話し方・行動はプレイヤーの発言そのものに委ねられます。ここではNPC側が認識している設定情報のみを入力してください。
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label>
                    <span style={{ fontSize: 11, color: '#888', display: 'block' }}>名前</span>
                    <input
                      style={{ width: '100%' }}
                      value={form.protagonist_name}
                      onChange={(e) => setForm({ ...form, protagonist_name: e.target.value })}
                    />
                  </label>
                  <label>
                    <span style={{ fontSize: 11, color: '#888', display: 'block' }}>あだ名（主な呼ばれ方、未指定なら「あなた」）</span>
                    <input
                      style={{ width: '100%' }}
                      value={form.protagonist_nickname}
                      onChange={(e) => setForm({ ...form, protagonist_nickname: e.target.value })}
                    />
                  </label>
                  <label>
                    <span style={{ fontSize: 11, color: '#888', display: 'block' }}>性別</span>
                    <input
                      style={{ width: '100%' }}
                      value={form.protagonist_gender}
                      onChange={(e) => setForm({ ...form, protagonist_gender: e.target.value })}
                    />
                  </label>
                  <label>
                    <span style={{ fontSize: 11, color: '#888', display: 'block' }}>職業・世界観内での立場</span>
                    <input
                      style={{ width: '100%' }}
                      value={form.protagonist_occupation}
                      onChange={(e) => setForm({ ...form, protagonist_occupation: e.target.value })}
                    />
                  </label>
                  <label>
                    <span style={{ fontSize: 11, color: '#888', display: 'block' }}>容貌・外見的特徴</span>
                    <input
                      style={{ width: '100%' }}
                      value={form.protagonist_appearance}
                      onChange={(e) => setForm({ ...form, protagonist_appearance: e.target.value })}
                    />
                  </label>
                </div>
                <label style={{ display: 'block', marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: '#888', display: 'block' }}>その他情報（家族構成など自由記述）</span>
                  <textarea
                    style={{ display: 'block', width: '100%', height: 46 }}
                    value={form.protagonist_notes}
                    onChange={(e) => setForm({ ...form, protagonist_notes: e.target.value })}
                  />
                </label>
              </>
            )}
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
