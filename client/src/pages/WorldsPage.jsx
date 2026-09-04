import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useWorlds, useWorldMutations, useCalendarHolidays, useCalendarHolidayMutations } from '../hooks/useWorlds.js';
import { useStylePresets } from '../hooks/useSettings.js';
import { useRoomTemplates } from '../hooks/useRoomTemplates.js';
import TagChips from '../components/ui/TagChips.jsx';
import DanbooruTagEditor from '../components/ui/DanbooruTagEditor.jsx';
import StatusDisplayGrid from '../components/ui/StatusDisplayGrid.jsx';
import { contentBundleApi, formatBundleImportSummary } from '../api/contentBundle.js';
import { useLocalStorageState } from '../hooks/useLocalStorageState.js';

const DEFAULT_STATUS_DISPLAY_SETTINGS = {
  strip: { self_stat: false, status: false, relationship_stage: false },
  panel: { self_stat: false, status: false, relationship_stage: false },
  chat_log: { self_stat: false, status: false, relationship_stage: false },
};

const DEFAULT_DATE_FORMAT_TEMPLATE = '${year} ${season} ${day}（${weekday}${holiday}${holiday_name}） ${time_slot}・${weather}';

const emptyForm = {
  name: '',
  worldview: '',
  author_note: '',
  time_slot_labels: ['朝', '昼', '放課後', '夜'],
  weather_options: ['晴れ', '曇り', '雨'],
  season_labels: ['春', '夏', '秋', '冬'],
  days_per_season: 30,
  day_of_week_labels: ['月', '火', '水', '木', '金', '土', '日'],
  holiday_weekday_indices: [],
  date_format_template: DEFAULT_DATE_FORMAT_TEMPLATE,
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
  notify_relationship_changes: false,
  status_display_settings: DEFAULT_STATUS_DISPLAY_SETTINGS,
  currency_enabled: false,
  underwear_random_enabled: false,
  currency_unit: '円',
  initial_money: 0,
  self_stat_auto_update_enabled: false,
  relationship_update_interval_turns: '',
  llm_value_delta_cap: '',
  mature_content_mode_enabled: false,
  refusal_detection_enabled: false,
  weather_tag_map: {},
  time_slot_tag_map: {},
  impression_auto_update_enabled: false,
  memory_prompt_limit: 5,
  memory_auto_extract_enabled: false,
  memory_editing_visible: true,
  held_items_prompt_limit: 0,
  continuous_room_session_enabled: false,
  memory_impression_interval_turns: '',
  conversation_summary_interval_turns: '',
  pose_enabled: false,
  cycle_enabled: false,
  cycle_length_days: 28,
  pregnancy_enabled: false,
  gestation_days: 84,
  conception_rate_multiplier: 1,
  character_aging: 'normal',
  child_appearance: 'none',
  child_maturation_days: 30,
  child_age_min: 4,
  child_age_max: 6,
  birth_lore: '',
  child_attribute_tags: '',
  warp_world_rules: true,
  warp_situation: true,
  warp_others_mind: true,
  deviation_handling: 'accept',
  policy_notice: '',
  warp_lore: '',
  child_inherit_parent_tags: false,
  child_random_attribute_tags: '',
  child_random_tag_count: 1,
  child_name_style: '和名',
};

// Per-label danbooru tag input for weather_options/time_slot_labels, so
// image generation can pull in a matching ${weather_tags}/${time_slot_tags}
// (see imagePromptBuilder.js's buildSceneTagParts). Keyed by the label text
// itself rather than array index, so it keeps working if entries are
// reordered/renamed via the TagChips editor above it.
function TagMapEditor({ labels, map, onChange }) {
  if (!labels || labels.length === 0) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>各項目に対応するdanbooruタグ（画像生成用、任意）</p>
      {labels.map((label) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 12, width: 70, flexShrink: 0 }}>{label}</span>
          <input
            style={{ flex: 1, fontSize: 12 }}
            value={map[label] ?? ''}
            onChange={(e) => onChange({ ...map, [label]: e.target.value })}
            placeholder="例: cloudy"
          />
        </div>
      ))}
    </div>
  );
}

export default function WorldsPage() {
  const queryClient = useQueryClient();
  const { data: worlds, isLoading } = useWorlds();
  const [exportPanelWorldId, setExportPanelWorldId] = useState(null);
  const [exportIncludeRooms, setExportIncludeRooms] = useState(false);
  const [exportIncludeCharacters, setExportIncludeCharacters] = useState(false);
  const { data: stylePresets } = useStylePresets();
  const { create, update, remove, uploadThumbnailImage, generateThumbnailImage } = useWorldMutations();
  const [searchParams] = useSearchParams();
  // Lets a link like RoomWorldConfigPage.jsx's "世界観の設定に戻る" button
  // (navigate(`/worlds?edit=${worldId}`)) reopen the World editor panel it
  // came from -- editingId is otherwise pure local state with no URL
  // representation, so without this a "back to World" link could only ever
  // land on the bare list. Read once on mount; user-driven selection
  // afterward is unaffected.
  const [editingId, setEditingId] = useState(() => {
    const editParam = searchParams.get('edit');
    return editParam ? Number(editParam) : null;
  });
  const worldRoomsWorldId = editingId != null && editingId !== 'new' ? editingId : null;
  const { data: worldRooms } = useRoomTemplates(worldRoomsWorldId);
  const [form, setForm] = useState(emptyForm);
  const [thumbGenerating, setThumbGenerating] = useState(false);
  const [thumbGenerateError, setThumbGenerateError] = useState(null);
  const [sortKey, setSortKey] = useLocalStorageState('worlds:sortKey', 'name');

  useEffect(() => {
    if (editingId == null || !worlds) return;
    const world = worlds.find((w) => w.id === editingId);
    if (world) {
      setForm({
        name: world.name,
        worldview: world.worldview,
        author_note: world.author_note ?? '',
        time_slot_labels: world.time_slot_labels,
        weather_options: world.weather_options,
        season_labels: world.season_labels,
        days_per_season: world.days_per_season,
        day_of_week_labels: world.day_of_week_labels,
        holiday_weekday_indices: world.holiday_weekday_indices,
        date_format_template: world.date_format_template ?? DEFAULT_DATE_FORMAT_TEMPLATE,
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
        notify_relationship_changes: Boolean(world.notify_relationship_changes),
        status_display_settings: world.status_display_settings ?? DEFAULT_STATUS_DISPLAY_SETTINGS,
        currency_enabled: Boolean(world.currency_enabled),
        underwear_random_enabled: Boolean(world.underwear_random_enabled),
        currency_unit: world.currency_unit ?? '円',
        initial_money: world.initial_money ?? 0,
        self_stat_auto_update_enabled: Boolean(world.self_stat_auto_update_enabled),
        relationship_update_interval_turns: world.relationship_update_interval_turns ?? '',
        llm_value_delta_cap: world.llm_value_delta_cap ?? '',
        mature_content_mode_enabled: Boolean(world.mature_content_mode_enabled),
        refusal_detection_enabled: Boolean(world.refusal_detection_enabled),
        memory_prompt_limit: world.memory_prompt_limit ?? 5,
        memory_auto_extract_enabled: Boolean(world.memory_auto_extract_enabled),
        memory_editing_visible: Boolean(world.memory_editing_visible),
        held_items_prompt_limit: world.held_items_prompt_limit ?? 0,
        continuous_room_session_enabled: Boolean(world.continuous_room_session_enabled),
        memory_impression_interval_turns: world.memory_impression_interval_turns ?? '',
        conversation_summary_interval_turns: world.conversation_summary_interval_turns ?? '',
        pose_enabled: Boolean(world.pose_enabled),
        cycle_enabled: Boolean(world.cycle_enabled),
        cycle_length_days: world.cycle_length_days ?? 28,
        pregnancy_enabled: world.pregnancy_enabled ?? false,
        gestation_days: world.gestation_days ?? 84,
        conception_rate_multiplier: world.conception_rate_multiplier ?? 1,
        character_aging: world.character_aging ?? 'normal',
        child_appearance: world.child_appearance ?? 'none',
        child_maturation_days: world.child_maturation_days ?? 30,
        child_age_min: world.child_age_min ?? 4,
        child_age_max: world.child_age_max ?? 6,
        birth_lore: world.birth_lore ?? '',
        child_attribute_tags: world.child_attribute_tags ?? '',
        warp_world_rules: world.warp_world_rules ?? true,
        warp_situation: world.warp_situation ?? true,
        warp_others_mind: world.warp_others_mind ?? true,
        deviation_handling: world.deviation_handling ?? 'accept',
        policy_notice: world.policy_notice ?? '',
        warp_lore: world.warp_lore ?? '',
        child_inherit_parent_tags: world.child_inherit_parent_tags ?? false,
        child_random_attribute_tags: world.child_random_attribute_tags ?? '',
        child_random_tag_count: world.child_random_tag_count ?? 1,
        child_name_style: world.child_name_style ?? '和名',
        weather_tag_map: world.weather_tag_map ?? {},
        time_slot_tag_map: world.time_slot_tag_map ?? {},
        impression_auto_update_enabled: Boolean(world.impression_auto_update_enabled),
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
      relationship_update_interval_turns:
        form.relationship_update_interval_turns === '' ? null : Number(form.relationship_update_interval_turns),
      llm_value_delta_cap: form.llm_value_delta_cap === '' ? null : Number(form.llm_value_delta_cap),
      memory_impression_interval_turns:
        form.memory_impression_interval_turns === '' ? null : Number(form.memory_impression_interval_turns),
      conversation_summary_interval_turns:
        form.conversation_summary_interval_turns === '' ? null : Number(form.conversation_summary_interval_turns),
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

  function toggleExportPanel(worldId) {
    setExportIncludeRooms(false);
    setExportIncludeCharacters(false);
    setExportPanelWorldId((current) => (current === worldId ? null : worldId));
  }

  async function handleExportWorld(worldId) {
    try {
      await contentBundleApi.exportWorld(worldId, {
        includeRoomTemplates: exportIncludeRooms,
        includeCharacters: exportIncludeRooms && exportIncludeCharacters,
      });
      setExportPanelWorldId(null);
    } catch (err) {
      window.alert(`エクスポートに失敗しました: ${err.message}`);
    }
  }

  async function handleImportBundle(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const result = await contentBundleApi.import(file);
      window.alert(formatBundleImportSummary(result));
      queryClient.invalidateQueries({ queryKey: ['worlds'] });
    } catch (err) {
      window.alert(`インポートに失敗しました: ${err.message}`);
    }
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

  // The "未所属" bucket always sorts last regardless of the chosen key
  // (matches RoomTemplatesPage.jsx's "未接続" group always sorting last).
  const sortedWorlds = [...worlds].sort((a, b) => {
    if (a.is_unassigned_bucket !== b.is_unassigned_bucket) return a.is_unassigned_bucket ? 1 : -1;
    if (sortKey === 'created_at') return new Date(b.created_at) - new Date(a.created_at);
    if (sortKey === 'last_played_at') {
      if (!a.last_played_at && !b.last_played_at) return 0;
      if (!a.last_played_at) return 1;
      if (!b.last_played_at) return -1;
      return new Date(b.last_played_at) - new Date(a.last_played_at);
    }
    return a.name.localeCompare(b.name, 'ja');
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>世界観一覧</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12 }}>
            並び順{' '}
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
              <option value="name">名前順</option>
              <option value="created_at">作成日順（新しい順）</option>
              <option value="last_played_at">最終プレイ順（新しい順）</option>
            </select>
          </label>
          <label style={{ fontSize: 12, cursor: 'pointer', alignSelf: 'center' }}>
            インポート（zip）
            <input type="file" accept=".zip" onChange={handleImportBundle} style={{ display: 'none' }} />
          </label>
          <button onClick={startCreate}>+ 新規世界観</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {sortedWorlds.map((world) => (
          <div key={world.id}>
            <div
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
                <button onClick={() => toggleExportPanel(world.id)}>エクスポート</button>
                {!world.is_unassigned_bucket && (
                  <>
                    <button onClick={() => startEdit(world)}>編集</button>
                    <button onClick={() => handleDelete(world)}>削除</button>
                  </>
                )}
              </div>
            </div>
            {exportPanelWorldId === world.id && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 8px', fontSize: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="checkbox" checked={exportIncludeRooms} onChange={(e) => setExportIncludeRooms(e.target.checked)} />
                  部屋テンプレートを含める
                </label>
                {exportIncludeRooms && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={exportIncludeCharacters}
                      onChange={(e) => setExportIncludeCharacters(e.target.checked)}
                    />
                    キャラクターも含める
                  </label>
                )}
                <button onClick={() => handleExportWorld(world.id)}>ダウンロード</button>
              </div>
            )}
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
            作者のメモ（最優先指示）
            <textarea
              style={{ display: 'block', width: '100%', height: 60 }}
              placeholder="例：一人称視点、会話文中心、ライトな文体。グロテスクな描写はしない。"
              value={form.author_note}
              onChange={(e) => setForm({ ...form, author_note: e.target.value })}
            />
            <span style={{ fontSize: 11, color: '#888' }}>
              文体・主なジャンル・表現方針など、最も優先度の高い指示です。会話履歴が伸びても薄れないよう、生成の直前に毎回差し込まれます（NovelAI等の「作者のメモ」に相当）。
            </span>
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
                <TagMapEditor
                  labels={form.time_slot_labels}
                  map={form.time_slot_tag_map}
                  onChange={(m) => setForm({ ...form, time_slot_tag_map: m })}
                />
              </div>
              <div>
                <p>天候候補</p>
                <TagChips
                  tags={form.weather_options}
                  onChange={(tags) => setForm({ ...form, weather_options: tags })}
                  placeholder="+ 天候を追加"
                />
                <TagMapEditor
                  labels={form.weather_options}
                  map={form.weather_tag_map}
                  onChange={(m) => setForm({ ...form, weather_tag_map: m })}
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
              <div>
                <p>曜日ラベル（順序付き）</p>
                <TagChips
                  tags={form.day_of_week_labels}
                  onChange={(tags) => setForm({ ...form, day_of_week_labels: tags })}
                  placeholder="+ 曜日を追加"
                />
              </div>
              <div>
                <p>休日にする曜日</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {form.day_of_week_labels.map((label, index) => (
                    <label key={index} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={form.holiday_weekday_indices.includes(index)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            holiday_weekday_indices: e.target.checked
                              ? [...form.holiday_weekday_indices, index]
                              : form.holiday_weekday_indices.filter((i) => i !== index),
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p>日付表示フォーマット</p>
                <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
                  チャット画面・ルート一覧の日付表示に使う書式です。使えるプレースホルダ：
                  <code>${'{year}'}</code>（例：1年目）／<code>${'{season}'}</code>（例：春の月）／
                  <code>${'{day}'}</code>（季節内の日、例：01日）／<code>${'{weekday}'}</code>（例：月曜日）／
                  <code>${'{holiday}'}</code>（曜日ベースの休日または下記の特別日のいずれかで「（休日）」、それ以外は空）／
                  <code>${'{holiday_name}'}</code>（下の「個別の休日」に登録した名前がある日だけ「・文化祭」のように付く。曜日ベースの休日には名前が無いので空のまま）／
                  <code>${'{time_slot}'}</code>（例：朝）／<code>${'{weather}'}</code>（例：晴れ）／
                  <code>${'{absolute_day}'}</code>（通し日数）／<code>${'{day_of_year}'}</code>（年内の通し日数、年が変わると1に戻る）
                </p>
                <input
                  style={{ width: '100%' }}
                  value={form.date_format_template}
                  onChange={(e) => setForm({ ...form, date_format_template: e.target.value })}
                  placeholder={DEFAULT_DATE_FORMAT_TEMPLATE}
                />
              </div>
            </div>
            {editingId !== 'new' && <CalendarHolidaysSection worldId={editingId} />}
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

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <input
                type="checkbox"
                checked={form.notify_relationship_changes}
                onChange={(e) => setForm({ ...form, notify_relationship_changes: e.target.checked })}
              />
              関係性の変化をチャット画面に通知する
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <input
                type="checkbox"
                checked={form.self_stat_auto_update_enabled}
                onChange={(e) => setForm({ ...form, self_stat_auto_update_enabled: e.target.checked })}
              />
              状態値（自己ステータス）をLLMが毎送信ごとに自動増減する
            </label>
            <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              対象軸は関係性軸／自己ステータスマスター画面の「LLM自動増減の対象」で個別に除外できます。
            </p>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <input
                type="checkbox"
                checked={form.mature_content_mode_enabled}
                onChange={(e) => setForm({ ...form, mature_content_mode_enabled: e.target.checked })}
              />
              際どい表現での拒否・説教を抑制する指示を追加する（成人向けWorld向け）
            </label>
            <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              ローカルLLM（Gemma等）が成人向け創作でも拒否文・空白応答を返してしまう場合にONにしてください。「これは個人利用の創作フィクションであり登場人物は全員成人」という前提と、拒否・説教をせず物語を続けるようシステムプロンプトに追加で指示します。
            </p>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <input
                type="checkbox"
                checked={form.refusal_detection_enabled}
                onChange={(e) => setForm({ ...form, refusal_detection_enabled: e.target.checked })}
              />
              拒否文が生成されてしまった場合、画面に表示せず履歴にも保存しない
            </label>
            <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              上記の抑制指示をすり抜けて拒否文が生成された場合の事後対策です。応答が「申し訳ございません」等の拒否フレーズだけで完結していたら、チャットに表示・保存せず「応答なし」という一時通知だけを出します。
            </p>

            <h4 style={{ margin: '16px 0 4px', fontSize: 13 }}>キャラの記憶（シーンをまたいで保持）</h4>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
              「前のセッションで何があったか」をルート単位で蓄積し、キャラ設定の一部としてプロンプトに載せます。上書きされないので、重要な出来事は何セッション経っても残ります。記憶はイベントアクション「記憶を追加」・下記の自動抽出・ルート画面での手動編集で追加できます。
            </p>

            <label style={{ display: 'block' }}>
              <span style={{ fontSize: 11, color: '#888' }}>プロンプトに載せる件数の上限（0で記憶機能を無効化）</span>
              <input
                type="number"
                min="0"
                style={{ width: 80, display: 'block' }}
                value={form.memory_prompt_limit}
                onChange={(e) => setForm({ ...form, memory_prompt_limit: e.target.value === '' ? 0 : Number(e.target.value) })}
              />
            </label>
            <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              ローカルLLMのコンテキストを圧迫しないための足切りです。ピン留めした記憶はこの件数の枠外で常に載ります。
            </p>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <input
                type="checkbox"
                checked={form.memory_auto_extract_enabled}
                onChange={(e) => setForm({ ...form, memory_auto_extract_enabled: e.target.checked })}
              />
              セッション終了時にLLMが重要な出来事を自動で記憶に残す
            </label>
            <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              部屋の移動・退室のたびにLLMを1回追加で呼び、その場面に「今後もずっと覚えているような出来事」があれば最大2件まで記録します。台本にない自発的な展開も拾えますが、その分の生成時間がかかります。
            </p>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <input
                type="checkbox"
                checked={form.memory_editing_visible}
                onChange={(e) => setForm({ ...form, memory_editing_visible: e.target.checked })}
              />
              ルート一覧画面に記憶の編集パネルを表示する
            </label>
            <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              制作中は記憶を直接編集できると便利ですが、遊ぶユーザーに見せたくない場合はOFFにしてください。OFFにしても記憶の蓄積とプロンプトへの反映は通常どおり動きます。
            </p>

            <h4 style={{ margin: '16px 0 4px', fontSize: 13 }}>NPCが持っている物（会話に自動で反映）</h4>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
              プレイヤーが渡したアイテムなどを各NPCが今持っているかを、キャラ設定の一部としてプロンプトに載せます（渡したが未着用の衣装は対象外）。「持ち物確認」コマンド（もちものカテゴリ）で明示的に確認した場合は、この件数上限に関わらずその場の全員の所持アイテムを全件見せます。
            </p>

            <label style={{ display: 'block' }}>
              <span style={{ fontSize: 11, color: '#888' }}>プロンプトに自動で載せる件数の上限（0で自動反映を無効化）</span>
              <input
                type="number"
                min="0"
                style={{ width: 80, display: 'block' }}
                value={form.held_items_prompt_limit}
                onChange={(e) => setForm({ ...form, held_items_prompt_limit: e.target.value === '' ? 0 : Number(e.target.value) })}
              />
            </label>
            <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              登場人物やアイテムが多いWorldほど小さめの値にしてください。取得が新しい順にこの件数までの名前だけが自動で渡されます。「持ち物確認」コマンド自体はこの設定に関わらず常に機能します。
            </p>

            <h4 style={{ margin: '16px 0 4px', fontSize: 13 }}>場面（セッション）の区切り方</h4>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
              通常は部屋を移動するたびに場面が切り替わり、会話履歴もそこで途切れます。「場所」として繋がった部屋を歩き回るWorldでは、移動しても会話を続けたいことがあるため、その場合はこれをONにしてください。
            </p>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.continuous_room_session_enabled}
                onChange={(e) => setForm({ ...form, continuous_room_session_enabled: e.target.checked })}
              />
              部屋を移動しても場面を継続する（繋がった部屋をまとめて1つの場面として扱う）
            </label>
            <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              ONにすると、移動しても会話履歴が途切れず「商店街で話していた続きを喫茶店でする」ができるようになります。この場合の場面の区切りは<strong>時間帯が変わった時</strong>です（移動の消費・ターン数による自動進行・時間跳躍イベントのいずれで進んでも同じ）。同席キャラは移動先の顔ぶれに入れ替わり、同行中のキャラだけが付いてきます。
            </p>

            <label style={{ display: 'block', marginTop: 10 }}>
              <span style={{ fontSize: 11, color: '#888' }}>記憶抽出・印象更新のターン数間隔（空欄で部屋移動・場面終了時のみ）</span>
              <input
                type="number"
                min="0"
                style={{ width: 80, display: 'block' }}
                value={form.memory_impression_interval_turns}
                onChange={(e) => setForm({ ...form, memory_impression_interval_turns: e.target.value })}
              />
            </label>
            <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              記憶の自動抽出と印象の自動更新は直近20メッセージしか見ないため、1つの場面が長引くと中盤の出来事が一度も拾われずに流れます。ここにターン数を入れると、場面の途中でも定期的に拾い直します（その分LLM呼び出しが増えます）。
            </p>

            <label style={{ display: 'block', marginTop: 10 }}>
              <span style={{ fontSize: 11, color: '#888' }}>会話のあらすじを作り直すターン数間隔（空欄で無効）</span>
              <input
                type="number"
                min="0"
                style={{ width: 80, display: 'block' }}
                value={form.conversation_summary_interval_turns}
                onChange={(e) => setForm({ ...form, conversation_summary_interval_turns: e.target.value })}
              />
            </label>
            <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              キャラの記憶とは別に、「この場面でこれまでに何があったか」を1つのあらすじとして持ち回ります。古いやりとりはトークン上限で履歴から溢れて消えますが、あらすじはキャラ設定と同じ枠に載るため消えません。長い場面でも話の筋が繋がるようにするための設定です。
            </p>

            <h4 style={{ margin: '16px 0 4px', fontSize: 13 }}>キャラのポーズ状態</h4>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
              座っている・立っている等の姿勢を管理し、部屋の初期ポーズ・イベントアクション「ポーズ変更」・LLMの任意の[POSE:xxx]タグ・画像生成タグに反映します（ポーズマスタ画面で登録）。
            </p>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.pose_enabled}
                onChange={(e) => setForm({ ...form, pose_enabled: e.target.checked })}
              />
              このWorldでキャラのポーズ状態を使用する
            </label>
            <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              OFFの間は部屋の初期ポーズが適用されず、イベントの「ポーズ変更」アクションとLLMの[POSE:xxx]タグも無視されます（画像生成にもポーズタグは含まれません）。
            </p>

            <h4 style={{ margin: '16px 0 4px', fontSize: 13 }}>妊娠しやすさの周期</h4>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
              日数の経過で「安全 → やや安全 → やや危険 → 危険 → 最危険」と変化するゲーム上の指標です。排卵日に向けて徐々に上がり直後に急落する形で、体調不良などの描写は扱いません。
              段階はキャラ情報に載り、イベント条件（flag_stateの<code>cycle_phase</code>）からも参照できます。適用するキャラはキャラ編集画面で個別に指定してください。
            </p>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.cycle_enabled}
                onChange={(e) => setForm({ ...form, cycle_enabled: e.target.checked })}
              />
              このWorldで周期を有効にする
            </label>

            {form.cycle_enabled && (
              <label style={{ display: 'block', marginTop: 8 }}>
                <span style={{ fontSize: 11, color: '#888' }}>周期の長さ（ゲーム内日数）</span>
                <input
                  type="number"
                  min="2"
                  style={{ width: 80, display: 'block' }}
                  value={form.cycle_length_days}
                  onChange={(e) => setForm({ ...form, cycle_length_days: Number(e.target.value) || 28 })}
                />
                <span style={{ fontSize: 11, color: '#888' }}>
                  既定28日。段階は周期長に対する割合で決まるため、短くしても変化の形は保たれます。
                </span>
              </label>
            )}

            <h4 style={{ margin: '16px 0 4px', fontSize: 13 }}>ユーザー指示の扱い</h4>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
              世界観や状況から外れた指示を、どこまで通すかの設定です。チェックを外した対象についてだけ「これは変えられない」という説明がプロンプトに追加されます。
              3つともONなら何も追加されません（＝これまでどおりの挙動）。
            </p>

            {[
              ['warp_world_rules', '世界法則・設定を変えられる'],
              ['warp_situation', '状況・物の在り処・居合わせる人物を変えられる'],
              ['warp_others_mind', '他者の感情・好意・記憶・意思を変えられる'],
            ].map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />
                {label}
              </label>
            ))}
            {!form.warp_others_mind && (
              <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                プロンプトに書くだけでは、LLMが極端な増減を返したときに素通りします。上の「LLMによる1回あたりの値の変動上限」も併せて設定してください。
              </p>
            )}

            <label style={{ display: 'block', marginTop: 10 }}>
              <span style={{ fontSize: 11, color: '#888' }}>世界観から外れた指示の扱い</span>
              <select
                style={{ display: 'block' }}
                value={form.deviation_handling}
                onChange={(e) => setForm({ ...form, deviation_handling: e.target.value })}
              >
                <option value="accept">受容（辻褄を後付けして通す）</option>
                <option value="reinterpret">読み替え（世界に合う形に丸めて反映する）</option>
                <option value="push_back">押し返し（反映せず、人物が現実的に反応する）</option>
              </select>
              <span style={{ fontSize: 11, color: '#888' }}>
                現時点では「受容」以外を選んでも挙動は変わりません（設定だけ先に保存できます）。
              </span>
            </label>

            <label style={{ display: 'block', marginTop: 10 }}>
              <span style={{ fontSize: 11, color: '#888' }}>改変能力などの設定文（世界観の説明）</span>
              <textarea
                rows={2}
                style={{ width: '100%', display: 'block' }}
                placeholder="例：主人公は無自覚な世界改変能力を持ち、望んだとおりに世界の理が歪むことがある。"
                value={form.warp_lore}
                onChange={(e) => setForm({ ...form, warp_lore: e.target.value })}
              />
              <span style={{ fontSize: 11, color: '#888' }}>
                上のチェックと同じ枠でプロンプトに載ります。<strong>能力の説明だけを書くと逆効果です</strong>
                — 何が変えられないのかを併せて示さないと、LLMはその説明を「無茶を通してよい」という許可として読みます。
              </span>
            </label>

            <label style={{ display: 'block', marginTop: 10 }}>
              <span style={{ fontSize: 11, color: '#888' }}>プレイ方針の宣言（ルート開始時に一度だけ表示）</span>
              <textarea
                rows={2}
                style={{ width: '100%', display: 'block' }}
                placeholder="例：このWorldは、キャラの気持ちを積み重ねで動かすことを想定しています。"
                value={form.policy_notice}
                onChange={(e) => setForm({ ...form, policy_notice: e.target.value })}
              />
              <span style={{ fontSize: 11, color: '#888' }}>
                プレイヤーへの表示のみで、LLMには渡しません。機構としては何も止めません。空欄なら表示されません。
              </span>
            </label>

            <h4 style={{ margin: '16px 0 4px', fontSize: 13 }}>妊娠・出産</h4>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
              受胎はイベントアクション「受胎判定」で起こします。段階は
              <code>pregnancy_stage</code>（未発覚／兆候／発覚可能／安定期／後期／臨月）としてイベント条件から参照でき、妊娠中は
              <code>cycle_phase</code>が「妊娠中」になります。出産は自動では起きません——臨月を条件にした出産イベントを作り、その結末で「妊娠の発覚・終了」を呼んでください。
            </p>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.pregnancy_enabled}
                onChange={(e) => setForm({ ...form, pregnancy_enabled: e.target.checked })}
              />
              このWorldで妊娠を有効にする
            </label>

            {form.pregnancy_enabled && (
              <div style={{ marginTop: 8, paddingLeft: 10, borderLeft: '2px solid #eee' }}>
                <label style={{ display: 'block' }}>
                  <span style={{ fontSize: 11, color: '#888' }}>妊娠期間（ゲーム内日数）</span>
                  <input
                    type="number"
                    min="2"
                    style={{ width: 80, display: 'block' }}
                    value={form.gestation_days}
                    onChange={(e) => setForm({ ...form, gestation_days: Number(e.target.value) || 84 })}
                  />
                  <span style={{ fontSize: 11, color: '#888' }}>
                    段階は期間に対する割合で決まるため、短くしても進み方の形は保たれます。実際のプレイでは1日進むのに
                    100通以上のやりとりが必要になるので、現実準拠の280日は出産まで到達しません。
                  </span>
                </label>

                <label style={{ display: 'block', marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: '#888' }}>受胎率の倍率</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    style={{ width: 80, display: 'block' }}
                    value={form.conception_rate_multiplier}
                    onChange={(e) => setForm({ ...form, conception_rate_multiplier: Number(e.target.value) })}
                  />
                  <span style={{ fontSize: 11, color: '#888' }}>
                    妊娠しやすさの段階から決まる確率（最危険50%〜安全2%）に掛かります。0で受胎しなくなります。
                    イベント側で確率を明示した場合は掛かりません。
                  </span>
                </label>

                <label style={{ display: 'block', marginTop: 10 }}>
                  <span style={{ fontSize: 11, color: '#888' }}>キャラの加齢</span>
                  <select
                    style={{ display: 'block' }}
                    value={form.character_aging}
                    onChange={(e) => setForm({ ...form, character_aging: e.target.value })}
                  >
                    <option value="normal">通常（n年後の跳躍を許可する）</option>
                    <option value="static">静止（サザエさん空間・年齢が上がらない）</option>
                  </select>
                  <span style={{ fontSize: 11, color: '#888' }}>
                    現時点では跳躍そのものが未実装のため、この設定に挙動の差はありません。
                  </span>
                </label>

                <label style={{ display: 'block', marginTop: 10 }}>
                  <span style={{ fontSize: 11, color: '#888' }}>子の名前の様式</span>
                  <select
                    style={{ display: 'block' }}
                    value={form.child_name_style}
                    onChange={(e) => setForm({ ...form, child_name_style: e.target.value })}
                  >
                    <option value="和名">和名（姓名を続けて書く：桜井さくら）</option>
                    <option value="洋名">洋名（名 姓 の順：Emma Shiraishi）</option>
                  </select>
                  <span style={{ fontSize: 11, color: '#888' }}>
                    出産イベントで「子の名前」を空欄にしたときだけ使います。姓は母の「フルネーム」欄を空白で区切った先頭を引き継ぎ、
                    区切りが無い（または空の）母の子は名前だけになります。名前を明示した場合はそちらが優先です。
                  </span>
                </label>

                <label style={{ display: 'block', marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: '#888' }}>子の登場</span>
                  <select
                    style={{ display: 'block' }}
                    value={form.child_appearance}
                    onChange={(e) => setForm({ ...form, child_appearance: e.target.value })}
                  >
                    <option value="none">登場しない（記録と会話の話題としてのみ存在）</option>
                    <option value="early">早熟（出産から一定日数で登場する）</option>
                    <option value="on_time_skip">跳躍時に登場する</option>
                  </select>
                </label>

                {form.child_appearance === 'early' && (
                  <div style={{ marginTop: 8, paddingLeft: 10, borderLeft: '2px solid #eee' }}>
                    <label style={{ display: 'block' }}>
                      <span style={{ fontSize: 11, color: '#888' }}>登場までの日数（出産から）</span>
                      <input
                        type="number"
                        min="0"
                        style={{ width: 80, display: 'block' }}
                        value={form.child_maturation_days}
                        onChange={(e) => setForm({ ...form, child_maturation_days: Number(e.target.value) || 0 })}
                      />
                    </label>
                    <label style={{ display: 'block', marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: '#888' }}>登場時の年齢（下限・上限）</span>
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="number"
                          min="0"
                          style={{ width: 70 }}
                          value={form.child_age_min}
                          onChange={(e) => setForm({ ...form, child_age_min: Number(e.target.value) || 0 })}
                        />
                        〜
                        <input
                          type="number"
                          min="0"
                          style={{ width: 70 }}
                          value={form.child_age_max}
                          onChange={(e) => setForm({ ...form, child_age_max: Number(e.target.value) || 0 })}
                        />
                      </span>
                      <span style={{ fontSize: 11, color: '#888' }}>
                        母親の年齢未満にも制限されます。学園ものでは就学前（4〜6歳）に留めておくと、在学・学籍の設定と衝突しません。
                      </span>
                    </label>
                    <label style={{ display: 'block', marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: '#888' }}>子に必ず付ける属性キー（固定枠）</span>
                      <input
                        style={{ width: '100%', display: 'block' }}
                        placeholder="例：家族"
                        value={form.child_attribute_tags}
                        onChange={(e) => setForm({ ...form, child_attribute_tags: e.target.value })}
                      />
                      <span style={{ fontSize: 11, color: '#888' }}>
                        カンマ区切り。ここに書いたキーは必ず付きます。下の3系統は足し合わされ、重複は1つにまとめられます。
                      </span>
                    </label>

                    <label style={{ display: 'block', marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: '#888' }}>ランダムで付く属性キーの候補</span>
                      <input
                        style={{ width: '100%', display: 'block' }}
                        placeholder="例：活発, 人見知り, 甘えん坊"
                        value={form.child_random_attribute_tags}
                        onChange={(e) => setForm({ ...form, child_random_attribute_tags: e.target.value })}
                      />
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: '#888' }}>この中から</span>
                        <input
                          type="number"
                          min="0"
                          style={{ width: 60 }}
                          value={form.child_random_tag_count}
                          onChange={(e) => setForm({ ...form, child_random_tag_count: Number(e.target.value) || 0 })}
                        />
                        <span style={{ fontSize: 11, color: '#888' }}>個を重複なしで抽選</span>
                      </span>
                      <span style={{ fontSize: 11, color: '#888' }}>
                        同じ設定から生まれた兄弟でも、少しずつ違う子になります。
                      </span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <input
                        type="checkbox"
                        checked={form.child_inherit_parent_tags}
                        onChange={(e) => setForm({ ...form, child_inherit_parent_tags: e.target.checked })}
                      />
                      母親の属性キーをランダムに引き継ぐ
                    </label>
                    <p style={{ fontSize: 11, color: '#888', margin: '2px 0 0' }}>
                      母のキーを1つずつ1/2の確率で引き継ぎます。<strong>既定はOFF</strong>
                      です — 母が「生徒」だと、それを継いだ幼児が教室に出てしまうため。継いで問題ないキー構成の世界観でだけONにしてください。
                    </p>
                    <p style={{ fontSize: 11, color: '#888', margin: '2px 0 0' }}>
                      3系統すべてが空（かつ継承OFF）なら、子はどの部屋にも自動では出てこなくなります。
                    </p>
                  </div>
                )}

                <label style={{ display: 'block', marginTop: 10 }}>
                  <span style={{ fontSize: 11, color: '#888' }}>出産と成長の理（世界観の説明）</span>
                  <textarea
                    rows={3}
                    style={{ width: '100%', display: 'block' }}
                    placeholder="例：生まれた子は一度「向こう側」に預けられ、しばらくして育った姿で戻ってくる。誰もが通る当たり前の習わし。"
                    value={form.birth_lore}
                    onChange={(e) => setForm({ ...form, birth_lore: e.target.value })}
                  />
                  <span style={{ fontSize: 11, color: '#888' }}>
                    世界観本文とは別に持ち、妊娠・出産・子が絡む場面でだけプロンプトに載せます。無関係なセッションでコンテキストを消費しません。
                  </span>
                </label>
              </div>
            )}

            <label style={{ display: 'block', marginTop: 10 }}>
              関係値の自動更新間隔（送信回数ごと、空欄で無効）
              <input
                type="number"
                min="1"
                style={{ display: 'block', width: 200 }}
                value={form.relationship_update_interval_turns}
                onChange={(e) => setForm({ ...form, relationship_update_interval_turns: e.target.value })}
                placeholder="空欄で無効"
              />
            </label>
            <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              設定した送信回数ごと、またはセッション終了時（部屋移動・退出時）にLLMが関係値の増減を判断します。
            </p>

            <label style={{ display: 'block', marginTop: 10 }}>
              LLMによる1回あたりの値の変動上限（空欄で無制限）
              <input
                type="number"
                min="1"
                style={{ display: 'block', width: 200 }}
                value={form.llm_value_delta_cap}
                onChange={(e) => setForm({ ...form, llm_value_delta_cap: e.target.value })}
                placeholder="空欄で無制限"
              />
            </label>
            <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              関係値・状態値をLLMが自動更新するとき、1回の増減をこの幅に収めます。無制限だと、
              一度の無茶な指示で好感度が振り切れることがあります。イベントで明示的に指定した増減には適用されません。
              自動更新の間隔が長いWorldでは、幅を狭めすぎると関係が進まなくなる点に注意してください。
            </p>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <input
                type="checkbox"
                checked={form.impression_auto_update_enabled}
                onChange={(e) => setForm({ ...form, impression_auto_update_enabled: e.target.checked })}
              />
              「あなたとの関係・印象」フィールドをセッション終了時にLLMが自動更新する
            </label>
            <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              キャラ編集画面の「あなたとの関係・印象」タブでフィールドを設定しているキャラのみ対象。部屋移動・退出のたびに、直近の会話を踏まえて値を書き換えるか判断します（LLM呼び出しが追加で発生します）。
            </p>
          </div>

          <div style={{ borderTop: '1px solid #ddd', paddingTop: 10, marginTop: 10 }}>
            <p style={{ fontWeight: 500 }}>貨幣設定</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.currency_enabled}
                onChange={(e) => setForm({ ...form, currency_enabled: e.target.checked })}
              />
              貨幣を使用する（買い物部屋でのアイテム入手に所持金が必要になります）
            </label>
            {form.currency_enabled && (
              <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                <label>
                  <span style={{ display: 'block', fontSize: 11, color: '#888' }}>単位</span>
                  <input
                    style={{ width: 80 }}
                    value={form.currency_unit}
                    onChange={(e) => setForm({ ...form, currency_unit: e.target.value })}
                  />
                </label>
                <label>
                  <span style={{ display: 'block', fontSize: 11, color: '#888' }}>初期所持金</span>
                  <input
                    type="number"
                    min="0"
                    style={{ width: 120 }}
                    value={form.initial_money}
                    onChange={(e) => setForm({ ...form, initial_money: Number(e.target.value) })}
                  />
                </label>
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid #ddd', paddingTop: 10, marginTop: 10 }}>
            <p style={{ fontWeight: 500 }}>下着ランダム設定</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.underwear_random_enabled}
                onChange={(e) => setForm({ ...form, underwear_random_enabled: e.target.checked })}
              />
              日付が変わるたびに下着をランダムに再抽選する（「衣装マスタ」で下着枠として登録したものが対象）
            </label>
          </div>

          <div style={{ borderTop: '1px solid #ddd', paddingTop: 10, marginTop: 10 }}>
            <p style={{ fontWeight: 500 }}>チャット欄へのステータス表示</p>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
              このWorldで見せてよい範囲の上限を設定します（プレイヤー個人の設定はこの範囲内でさらに絞り込めます。設定画面から変更可能）
            </p>
            <StatusDisplayGrid
              value={form.status_display_settings}
              onChange={(next) => setForm({ ...form, status_display_settings: next })}
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

          {editingId !== 'new' && (
            <div style={{ borderTop: '1px solid #ddd', paddingTop: 10, marginTop: 16 }}>
              <p style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>この世界観の部屋</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(worldRooms ?? []).map((r) => (
                  <div
                    key={r.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, border: '1px solid #eee', borderRadius: 6, padding: '4px 8px' }}
                  >
                    <span style={{ flex: 1 }}>{r.name}</span>
                    <Link to={`/rooms/${r.id}/worlds/${editingId}`}>
                      <button>設定</button>
                    </Link>
                  </div>
                ))}
                {(worldRooms ?? []).length === 0 && <p style={{ fontSize: 12, color: '#888' }}>この世界観にアタッチされた部屋がまだありません</p>}
              </div>
              <p style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
                部屋の新規作成・World全体へのアタッチは「部屋テンプレート」画面から行います。「設定」ボタンから移動先（つながり）や参加キャラ枠などを編集できます。
              </p>
            </div>
          )}

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

function CalendarHolidaysSection({ worldId }) {
  const { data: holidays } = useCalendarHolidays(worldId);
  const { create, remove } = useCalendarHolidayMutations(worldId);
  const [dayOfYear, setDayOfYear] = useState('');
  const [label, setLabel] = useState('');

  async function handleAdd() {
    if (!dayOfYear) return;
    await create.mutateAsync({ day_of_year: Number(dayOfYear), label });
    setDayOfYear('');
    setLabel('');
  }

  return (
    <div style={{ marginTop: 12 }}>
      <p>個別の休日（年内の日付、毎年繰り返す）</p>
      <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
        「年内の日付」は季節ラベル数×季節が切り替わる日数間隔で一周する暦の中の日数（1始まり）です
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
        {(holidays ?? []).map((h) => (
          <div
            key={h.id}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, border: '1px solid #eee', borderRadius: 6, padding: '4px 8px' }}
          >
            <span style={{ flex: 1 }}>
              {h.day_of_year}日目{h.label && `（${h.label}）`}
            </span>
            <button onClick={() => remove.mutateAsync(h.id)}>削除</button>
          </div>
        ))}
        {(holidays ?? []).length === 0 && <p style={{ fontSize: 12, color: '#888' }}>まだ個別の休日はありません</p>}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="number" min="1" style={{ width: 80 }} placeholder="日数" value={dayOfYear} onChange={(e) => setDayOfYear(e.target.value)} />
        <input style={{ flex: 1 }} placeholder="表示名（任意、例：文化祭）" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button onClick={handleAdd} disabled={!dayOfYear}>
          + 追加
        </button>
      </div>
    </div>
  );
}
