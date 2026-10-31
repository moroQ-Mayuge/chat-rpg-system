import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useWorlds } from '../hooks/useWorlds.js';
import { useAllPropCategories } from '../hooks/usePropCategories.js';
import { useAllItemCategories } from '../hooks/useItemCategories.js';
import { usePoseMasters } from '../hooks/usePoseMasters.js';
import {
  useRoomTemplate,
  useRoomTemplateMutations,
  useRoomWorlds,
  useRoomWorldMutations,
} from '../hooks/useRoomTemplates.js';
import TagChips from '../components/ui/TagChips.jsx';
import { roomTemplatesApi } from '../api/roomTemplates.js';

function tagsToArray(text) {
  return (text || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function tagsToText(tags) {
  return tags.join(', ');
}

const emptyForm = {
  name: '',
  worldview_mode: 'inherit',
  initial_situation: '',
  location_text: '',
  location_tags: [],
  atmosphere_text: '',
  atmosphere_tags: [],
  worldview: '',
  slots: [],
  profiles: [],
  sub_rooms: [],
  prop_category_ids: [],
  item_category_ids: [],
  turns_per_time_slot_enabled: false,
  turns_per_time_slot: 15,
  attribute_tags: [],
  default_pose_id: null,
  is_place: false,
  ends_session_on_enter: false,
  is_shop: false,
  suppress_auto_population: false,
  reset_items_per_session: false,
  outfit_acquisition_mode: 'none',
  outfit_attribute_tags: [],
  shop_lineup_min: '',
  shop_lineup_max: '',
  shop_lineup_refresh_unit: 'turn',
  shop_lineup_refresh_interval: 0,
};

// Room master data now: what a room IS, shared across every World that
// attaches it (see 0030_room_world_decoupling.sql). World-specific concerns
// — who actually fills a participant slot, which exact props are placed,
// the connection graph — live on RoomWorldConfigPage.jsx instead.
export default function RoomTemplateEditPage() {
  const { id } = useParams();
  const isNew = id === undefined;
  const navigate = useNavigate();
  const { data: worlds } = useWorlds();
  const { data: propCategories } = useAllPropCategories();
  const { data: itemCategories } = useAllItemCategories();
  const { data: poseMasters } = usePoseMasters();
  const { data: existing } = useRoomTemplate(isNew ? null : id);
  const { create, update, uploadBackgroundImage, generateBackgroundImage } = useRoomTemplateMutations();
  const { data: attachedWorlds } = useRoomWorlds(isNew ? null : id);
  const { attach, detach } = useRoomWorldMutations(isNew ? null : id);
  const [form, setForm] = useState(emptyForm);
  const [policyHint, setPolicyHint] = useState('');
  const [bgGenerating, setBgGenerating] = useState(false);
  const [bgGenerateError, setBgGenerateError] = useState(null);
  const [bgGenerateWorldId, setBgGenerateWorldId] = useState('');
  // サブ部屋の背景生成中のサブ部屋(フォーム上の位置)と、直近のエラー。
  const [subBgGeneratingIndex, setSubBgGeneratingIndex] = useState(null);
  const [subBgError, setSubBgError] = useState(null);
  const [attachWorldId, setAttachWorldId] = useState('');

  // フォームは「この部屋を最初に読み込んだ時」にだけ取得結果から作る。画像の生成・アップロード
  // などで部屋の取得結果が更新されても(再取得・ウィンドウの再フォーカス等を含む)、入力中の
  // 内容を保存前の値に巻き戻さないため。別の部屋を開いた時(idが変わった時)は作り直す。
  const seededRoomIdRef = useRef(null);
  useEffect(() => {
    if (!existing) return;
    if (seededRoomIdRef.current === existing.id) return;
    seededRoomIdRef.current = existing.id;
    setForm({
      name: existing.name,
      worldview_mode: existing.worldview_mode,
      initial_situation: existing.initial_situation,
      location_text: existing.location_text,
      location_tags: tagsToArray(existing.location_tags),
      atmosphere_text: existing.atmosphere_text,
      atmosphere_tags: tagsToArray(existing.atmosphere_tags),
      worldview: existing.worldview || '',
      slots: existing.slots.map((s) => ({ id: s.id, attribute_tags: tagsToArray(s.attribute_tags), note: s.note, sub_room_id: s.sub_room_id ?? null })),
      profiles: existing.profiles.map((p) => ({
        id: p.id,
        name: p.name,
        attribute_tags: tagsToArray(p.attribute_tags),
        atmosphere_text: p.atmosphere_text,
        location_text: p.location_text,
        selection_mode: p.selection_mode,
        weight: p.weight,
      })),
      sub_rooms: (existing.sub_rooms ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        is_default: Boolean(s.is_default),
        location_text: s.location_text,
        atmosphere_text: s.atmosphere_text,
        location_tags: tagsToArray(s.location_tags),
        atmosphere_tags: tagsToArray(s.atmosphere_tags),
        background_image_path: s.background_image_path ?? '',
        enter_movement_cost: s.enter_movement_cost ?? 0,
        is_shop: s.is_shop == null ? null : Boolean(s.is_shop),
        outfit_acquisition_mode: s.outfit_acquisition_mode ?? '',
        outfit_attribute_tags: tagsToArray(s.outfit_attribute_tags),
        shop_lineup_min: s.shop_lineup_min ?? '',
        shop_lineup_max: s.shop_lineup_max ?? '',
        shop_lineup_refresh_unit: s.shop_lineup_refresh_unit ?? '',
        shop_lineup_refresh_interval: s.shop_lineup_refresh_interval ?? '',
        item_category_ids: s.item_category_ids ?? [],
      })),
      prop_category_ids: existing.candidate_prop_categories.map((c) => c.id),
      item_category_ids: existing.candidate_item_categories.map((c) => c.id),
      turns_per_time_slot_enabled: existing.turns_per_time_slot != null,
      turns_per_time_slot: existing.turns_per_time_slot ?? 15,
      background_image_path: existing.background_image_path,
      attribute_tags: tagsToArray(existing.attribute_tags),
      default_pose_id: existing.default_pose_id ?? null,
      is_place: Boolean(existing.is_place),
      ends_session_on_enter: Boolean(existing.ends_session_on_enter),
      is_shop: Boolean(existing.is_shop),
      suppress_auto_population: Boolean(existing.suppress_auto_population),
      reset_items_per_session: Boolean(existing.reset_items_per_session),
      outfit_acquisition_mode: existing.outfit_acquisition_mode ?? 'none',
      outfit_attribute_tags: tagsToArray(existing.outfit_attribute_tags),
      shop_lineup_min: existing.shop_lineup_min ?? '',
      shop_lineup_max: existing.shop_lineup_max ?? '',
      shop_lineup_refresh_unit: existing.shop_lineup_refresh_unit ?? 'turn',
      shop_lineup_refresh_interval: existing.shop_lineup_refresh_interval ?? 0,
    });
  }, [existing]);

  useEffect(() => {
    const real = (attachedWorlds ?? []).filter((w) => !w.is_unassigned_bucket);
    if (real.length > 0 && !bgGenerateWorldId) setBgGenerateWorldId(String(real[0].id));
  }, [attachedWorlds, bgGenerateWorldId]);

  function addSlot() {
    setForm((f) => ({ ...f, slots: [...f.slots, { attribute_tags: [...f.attribute_tags], note: '', sub_room_id: null }] }));
  }

  function updateSlot(index, patch) {
    setForm((f) => ({ ...f, slots: f.slots.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
  }

  function removeSlot(index) {
    setForm((f) => ({ ...f, slots: f.slots.filter((_, i) => i !== index) }));
  }

  function addProfile() {
    setForm((f) => ({
      ...f,
      profiles: [
        ...f.profiles,
        { name: '', attribute_tags: [], atmosphere_text: '', location_text: '', selection_mode: 'random', weight: 1 },
      ],
    }));
  }

  function updateProfile(index, patch) {
    setForm((f) => ({ ...f, profiles: f.profiles.map((p, i) => (i === index ? { ...p, ...patch } : p)) }));
  }

  function removeProfile(index) {
    setForm((f) => ({ ...f, profiles: f.profiles.filter((_, i) => i !== index) }));
  }

  function addSubRoom() {
    setForm((f) => ({
      ...f,
      sub_rooms: [
        ...f.sub_rooms,
        {
          name: '',
          is_default: false,
          location_text: '',
          atmosphere_text: '',
          location_tags: [],
          atmosphere_tags: [],
          background_image_path: '',
          enter_movement_cost: 0,
          // 商取引の上書き(Stage 3)。null/空=部屋本体を継承。
          is_shop: null,
          outfit_acquisition_mode: '',
          outfit_attribute_tags: [],
          shop_lineup_min: '',
          shop_lineup_max: '',
          shop_lineup_refresh_unit: '',
          shop_lineup_refresh_interval: '',
          item_category_ids: [],
        },
      ],
    }));
  }

  // 既定(入口)は親に高々1件。1つをONにしたら他は自動でOFFにする。
  function updateSubRoom(index, patch) {
    setForm((f) => ({
      ...f,
      sub_rooms: f.sub_rooms.map((s, i) => {
        if (i === index) return { ...s, ...patch };
        return patch.is_default ? { ...s, is_default: false } : s;
      }),
    }));
  }

  function removeSubRoom(index) {
    setForm((f) => ({ ...f, sub_rooms: f.sub_rooms.filter((_, i) => i !== index) }));
  }

  function moveSubRoom(index, delta) {
    setForm((f) => {
      const target = index + delta;
      if (target < 0 || target >= f.sub_rooms.length) return f;
      const next = [...f.sub_rooms];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...f, sub_rooms: next };
    });
  }

  // 背景はファイルを保存してパスだけ受け取り、フォームへ入れる(DBへは部屋の保存時に反映)。
  async function handleSubRoomBackgroundUpload(index, e) {
    const file = e.target.files[0];
    if (!file || isNew) return;
    const result = await roomTemplatesApi.uploadSubRoomBackgroundImage(id, file);
    updateSubRoom(index, { background_image_path: result.background_image_path });
    e.target.value = '';
  }

  // サブ部屋の背景画像を生成する。プロンプトのタグは、実行時の場所タグの解決と同じく
  // 「サブ部屋のタグが空でなければそれ、空なら部屋本体のタグ」(どちらも画面の入力中の値)。
  // 結果はフォームの画像パスだけに反映し、DBへは部屋の保存時に反映される。
  async function handleGenerateSubRoomBackground(index, mode) {
    if (isNew) return;
    const sub = form.sub_rooms[index];
    const pick = (own, parent) => (tagsToText(own).trim() ? tagsToText(own) : tagsToText(parent));
    setSubBgGeneratingIndex(index);
    setSubBgError(null);
    try {
      const result = await roomTemplatesApi.generateSubRoomBackgroundImage(id, {
        mode,
        worldId: bgGenerateWorldId ? Number(bgGenerateWorldId) : null,
        locationTags: pick(sub.location_tags, form.location_tags),
        atmosphereTags: pick(sub.atmosphere_tags, form.atmosphere_tags),
        sourceImagePath: mode === 'refine' ? sub.background_image_path : undefined,
      });
      updateSubRoom(index, { background_image_path: result.background_image_path });
    } catch (err) {
      setSubBgError({ index, message: err.message });
    } finally {
      setSubBgGeneratingIndex(null);
    }
  }

  function toggleSubRoomItemCategory(index, categoryId) {
    setForm((f) => ({
      ...f,
      sub_rooms: f.sub_rooms.map((s, i) =>
        i === index
          ? {
              ...s,
              item_category_ids: s.item_category_ids.includes(categoryId)
                ? s.item_category_ids.filter((id2) => id2 !== categoryId)
                : [...s.item_category_ids, categoryId],
            }
          : s,
      ),
    }));
  }

  function toggleCategory(categoryId) {
    setForm((f) => ({
      ...f,
      prop_category_ids: f.prop_category_ids.includes(categoryId)
        ? f.prop_category_ids.filter((id2) => id2 !== categoryId)
        : [...f.prop_category_ids, categoryId],
    }));
  }

  function toggleItemCategory(categoryId) {
    setForm((f) => ({
      ...f,
      item_category_ids: f.item_category_ids.includes(categoryId)
        ? f.item_category_ids.filter((id2) => id2 !== categoryId)
        : [...f.item_category_ids, categoryId],
    }));
  }

  async function save() {
    const payload = {
      name: form.name,
      worldview_mode: form.worldview_mode,
      initial_situation: form.initial_situation,
      location_text: form.location_text,
      location_tags: tagsToText(form.location_tags),
      atmosphere_text: form.atmosphere_text,
      atmosphere_tags: tagsToText(form.atmosphere_tags),
      worldview: form.worldview_mode === 'custom' ? form.worldview : null,
      slots: form.slots.map((s, i) => ({ attribute_tags: tagsToText(s.attribute_tags), note: s.note, sort_order: i, sub_room_id: s.sub_room_id ?? null })),
      profiles: form.profiles.map((p, i) => ({
        name: p.name,
        attribute_tags: tagsToText(p.attribute_tags),
        atmosphere_text: p.atmosphere_text,
        location_text: p.location_text,
        selection_mode: p.selection_mode,
        weight: Number(p.weight) || 1,
        sort_order: i,
      })),
      // idを送ることでサーバー側が同じ行を更新する(進行中セッションの位置が保存で消えない)。
      sub_rooms: form.sub_rooms.map((s) => ({
        id: s.id,
        name: s.name,
        is_default: s.is_default,
        location_text: s.location_text,
        atmosphere_text: s.atmosphere_text,
        location_tags: tagsToText(s.location_tags),
        atmosphere_tags: tagsToText(s.atmosphere_tags),
        background_image_path: s.background_image_path,
        enter_movement_cost: Number(s.enter_movement_cost) || 0,
        is_shop: s.is_shop,
        outfit_acquisition_mode: s.outfit_acquisition_mode || null,
        outfit_attribute_tags: tagsToText(s.outfit_attribute_tags),
        shop_lineup_min: s.shop_lineup_min === '' ? null : Number(s.shop_lineup_min),
        shop_lineup_max: s.shop_lineup_max === '' ? null : Number(s.shop_lineup_max),
        shop_lineup_refresh_unit: s.shop_lineup_refresh_unit || null,
        shop_lineup_refresh_interval: s.shop_lineup_refresh_interval === '' ? null : Number(s.shop_lineup_refresh_interval),
        item_category_ids: s.item_category_ids,
      })),
      prop_category_ids: form.prop_category_ids,
      item_category_ids: form.item_category_ids,
      turns_per_time_slot: form.turns_per_time_slot_enabled ? form.turns_per_time_slot : null,
      attribute_tags: tagsToText(form.attribute_tags),
      default_pose_id: form.default_pose_id,
      is_place: form.is_place,
      ends_session_on_enter: form.ends_session_on_enter,
      is_shop: form.is_shop,
      suppress_auto_population: form.suppress_auto_population,
      reset_items_per_session: form.reset_items_per_session,
      outfit_acquisition_mode: form.outfit_acquisition_mode,
      outfit_attribute_tags: tagsToText(form.outfit_attribute_tags),
      shop_lineup_min: form.shop_lineup_min === '' ? null : Number(form.shop_lineup_min),
      shop_lineup_max: form.shop_lineup_max === '' ? null : Number(form.shop_lineup_max),
      shop_lineup_refresh_unit: form.shop_lineup_refresh_unit,
      shop_lineup_refresh_interval: Number(form.shop_lineup_refresh_interval) || 0,
    };
    if (isNew) {
      const created = await create.mutateAsync(payload);
      navigate(`/rooms/${created.id}/edit`);
    } else {
      await update.mutateAsync({ id, data: payload });
      navigate('/rooms');
    }
  }

  async function handleBackgroundUpload(e) {
    const file = e.target.files[0];
    if (!file || isNew) return;
    const updated = await uploadBackgroundImage.mutateAsync({ id, file });
    // 画像だけを反映する(他の入力中の内容には触れない)。
    setForm((f) => ({ ...f, background_image_path: updated.background_image_path }));
  }

  async function handleGenerateBackground(mode) {
    if (isNew) return;
    setBgGenerating(true);
    setBgGenerateError(null);
    try {
      // 画面で入力中のタグ(未保存でも)でプロンプトを作る。結果は画像だけを反映し、他の入力中の内容には触れない。
      const updated = await generateBackgroundImage.mutateAsync({
        id,
        mode,
        worldId: bgGenerateWorldId ? Number(bgGenerateWorldId) : null,
        tags: { location_tags: tagsToText(form.location_tags), atmosphere_tags: tagsToText(form.atmosphere_tags) },
      });
      setForm((f) => ({ ...f, background_image_path: updated.background_image_path }));
    } catch (err) {
      setBgGenerateError(err.message);
    } finally {
      setBgGenerating(false);
    }
  }

  async function handleAttachWorld() {
    if (!attachWorldId) return;
    await attach.mutateAsync(Number(attachWorldId));
    setAttachWorldId('');
  }

  const attachedWorldIds = new Set((attachedWorlds ?? []).map((w) => w.id));
  const attachCandidates = (worlds ?? []).filter((w) => !w.is_unassigned_bucket && !attachedWorldIds.has(w.id));
  // 「未所属」は実Worldへ何もアタッチされていない事を示す自動フォールバック
  // (roomTemplatesRepo.js/worldRoomTemplatesRepo.js側で自動的に付け外しされる)
  // なので、実World一覧としては見せない——ここに出すと「未所属の中で部屋を設定する」
  // ような誤操作を誘発する。
  const realAttachedWorlds = (attachedWorlds ?? []).filter((w) => !w.is_unassigned_bucket);

  if (!worlds || !propCategories) return <p>読み込み中...</p>;

  return (
    <div>
      <h2>{isNew ? '新規部屋（共通マスタ）' : '部屋（共通マスタ）を編集'}</h2>
      <p style={{ fontSize: 11, color: '#888', marginTop: -8 }}>
        ここで編集する内容は複数の世界観で共有されます。誰が同席するか・どんなPropを置くか・どこへ移動できるかは、下のアタッチ済みWorldごとの設定画面で決めます。
      </p>

      <div style={{ border: '1px solid var(--border-accent, #93c5fd)', borderRadius: 8, padding: 10, marginBottom: 14 }}>
        <p style={{ fontWeight: 500, margin: '0 0 6px' }}>LLMでランダム作成</p>
        <p style={{ margin: '0 0 4px' }}>方針（自由記述）</p>
        <textarea
          style={{ width: '100%', height: 40 }}
          value={policyHint}
          onChange={(e) => setPolicyHint(e.target.value)}
          placeholder="例：現代学園、放課後の静かな教室、恋愛イベント向け"
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button disabled title="KoboldCpp連携（Phase 5/6）実装後に有効化されます">
            この方針でランダム生成
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label>
            部屋名
            <input
              style={{ display: 'block', width: '100%' }}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>

          <div>
            <p style={{ marginBottom: 4 }}>世界観モード</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <button
                style={{ fontWeight: form.worldview_mode === 'inherit' ? 700 : 400 }}
                onClick={() => setForm({ ...form, worldview_mode: 'inherit' })}
              >
                継承
              </button>
              <button
                style={{ fontWeight: form.worldview_mode === 'custom' ? 700 : 400 }}
                onClick={() => setForm({ ...form, worldview_mode: 'custom' })}
              >
                独自
              </button>
            </div>
            {form.worldview_mode === 'inherit' ? (
              <p style={{ fontSize: 12, color: '#666' }}>継承時は同席するWorldの世界観がそのまま使われます</p>
            ) : (
              <textarea
                style={{ width: '100%', height: 46 }}
                value={form.worldview}
                onChange={(e) => setForm({ ...form, worldview: e.target.value })}
                placeholder="この部屋固有の世界観"
              />
            )}
          </div>

          <label>
            開始時のシチュエーション
            <textarea
              style={{ display: 'block', width: '100%', height: 46 }}
              value={form.initial_situation}
              onChange={(e) => setForm({ ...form, initial_situation: e.target.value })}
            />
          </label>

          <div>
            <p style={{ marginBottom: 4 }}>場所</p>
            <input
              style={{ display: 'block', width: '100%', marginBottom: 4 }}
              value={form.location_text}
              onChange={(e) => setForm({ ...form, location_text: e.target.value })}
            />
            <TagChips
              tags={form.location_tags}
              onChange={(tags) => setForm({ ...form, location_tags: tags })}
              placeholder="+ 画像生成用タグを追加"
            />
          </div>

          <div>
            <p style={{ marginBottom: 4 }}>雰囲気</p>
            <input
              style={{ display: 'block', width: '100%', marginBottom: 4 }}
              value={form.atmosphere_text}
              onChange={(e) => setForm({ ...form, atmosphere_text: e.target.value })}
            />
            <TagChips
              tags={form.atmosphere_tags}
              onChange={(tags) => setForm({ ...form, atmosphere_tags: tags })}
              placeholder="+ 画像生成用タグを追加"
            />
          </div>

          <div>
            <p style={{ marginBottom: 4 }}>属性キー</p>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
              ここに設定したキーとキャラクターの属性キーが一致すると、そのキャラはこの部屋に自動同席できる対象になります
            </p>
            <TagChips
              tags={form.attribute_tags}
              onChange={(tags) => setForm({ ...form, attribute_tags: tags })}
              placeholder="例: 部活, 図書委員"
            />
          </div>

          <div>
            <p style={{ marginBottom: 4 }}>この部屋に入った時の初期ポーズ</p>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
              新しい部屋セッションが始まる時、同席する各キャラのポーズをここで指定した状態から始めます（未指定＝ポーズなし）。部屋を移動すると常にリセットされます。
            </p>
            <select
              value={form.default_pose_id ?? ''}
              onChange={(e) => setForm({ ...form, default_pose_id: Number(e.target.value) || null })}
            >
              <option value="">指定なし</option>
              {(poseMasters ?? []).map((pm) => (
                <option key={pm.id} value={pm.id}>
                  {pm.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <p style={{ marginBottom: 4 }}>背景イメージ</p>
            <div
              style={{
                aspectRatio: '16 / 9',
                background: form.background_image_path ? `url(${form.background_image_path}) center/cover` : '#eee',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#999',
                fontSize: 12,
                marginBottom: 6,
              }}
            >
              {!form.background_image_path && '未設定'}
            </div>
            {!isNew && realAttachedWorlds.length > 0 && (
              <label style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>
                どのWorldのスタイルで生成するか
                <select
                  style={{ display: 'block', width: '100%' }}
                  value={bgGenerateWorldId}
                  onChange={(e) => setBgGenerateWorldId(e.target.value)}
                >
                  {realAttachedWorlds.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <label style={{ flex: 1 }}>
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBackgroundUpload} disabled={isNew} />
                <span style={{ display: 'block', textAlign: 'center', border: '1px solid #ccc', borderRadius: 6, padding: 6, cursor: isNew ? 'not-allowed' : 'pointer' }}>
                  アップロード{isNew && '（先に保存してください）'}
                </span>
              </label>
              <button style={{ flex: 1 }} onClick={() => handleGenerateBackground('fresh')} disabled={isNew || bgGenerating}>
                {bgGenerating ? '生成中...' : '新規生成'}
              </button>
              <button
                style={{ flex: 1 }}
                onClick={() => handleGenerateBackground('refine')}
                disabled={isNew || bgGenerating || !form.background_image_path}
                title={!form.background_image_path ? '既存の背景画像がある場合のみ使用できます' : '現在の画像を基に調整して再生成'}
              >
                {bgGenerating ? '生成中...' : '現在の画像から調整'}
              </button>
            </div>
            {bgGenerateError && <p style={{ color: 'red', fontSize: 11, marginTop: 4 }}>エラー: {bgGenerateError}</p>}
            {isNew && <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>画像生成は先に保存してから行えます</p>}
          </div>

          <div>
            <p style={{ marginBottom: 4 }}>出現候補の設備・機材カテゴリ</p>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
              ここでは大まかなカテゴリだけ選びます。実際にどの個体を置くかはWorldごとの設定画面で決めます。
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {propCategories.map((cat) => (
                <label
                  key={cat.id}
                  style={{
                    fontSize: 12,
                    padding: '3px 8px',
                    borderRadius: 999,
                    border: '1px solid #ccc',
                    background: form.prop_category_ids.includes(cat.id) ? '#dbeafe' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    style={{ marginRight: 4 }}
                    checked={form.prop_category_ids.includes(cat.id)}
                    onChange={() => toggleCategory(cat.id)}
                  />
                  {cat.name}
                </label>
              ))}
              {propCategories.length === 0 && <p style={{ fontSize: 12, color: '#888' }}>カテゴリが登録されていません</p>}
            </div>
          </div>

          <div>
            <p style={{ marginBottom: 4 }}>周辺確認で入手可能なアイテムカテゴリ</p>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
              チャットで「@周辺」を含めて発言すると、LLMはここで選んだカテゴリの範囲内でのみアイテムを生成できます（未選択の場合はWorldの全カテゴリが対象のまま）。具体的なアイテムはLLMがその場で自由に命名します。この部屋を「買い物できる部屋」にした場合は、ここで選んだカテゴリが商品カテゴリとしても使われます（購入額が設定済みのアイテムのみ販売対象）。
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {itemCategories?.map((cat) => (
                <label
                  key={cat.id}
                  style={{
                    fontSize: 12,
                    padding: '3px 8px',
                    borderRadius: 999,
                    border: '1px solid #ccc',
                    background: form.item_category_ids.includes(cat.id) ? '#dbeafe' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    style={{ marginRight: 4 }}
                    checked={form.item_category_ids.includes(cat.id)}
                    onChange={() => toggleItemCategory(cat.id)}
                  />
                  {cat.name}
                </label>
              ))}
              {(!itemCategories || itemCategories.length === 0) && (
                <p style={{ fontSize: 12, color: '#888' }}>カテゴリが登録されていません</p>
              )}
            </div>
          </div>

          <div>
            <p style={{ marginBottom: 4 }}>参加キャラ枠</p>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
              属性キーで抽象的に枠だけ定義します。どのキャラを実際に充てるかはWorldごとの設定画面で選びます。
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {form.slots.map((slot, i) => (
                <div key={slot.id ?? `new-${i}`} style={{ border: '1px solid #eee', borderRadius: 6, padding: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <input
                      style={{ flex: 1, marginRight: 6 }}
                      placeholder="枠のメモ（例：部活の先輩）"
                      value={slot.note}
                      onChange={(e) => updateSlot(i, { note: e.target.value })}
                    />
                    {form.sub_rooms.length > 0 && (
                      <select
                        style={{ marginRight: 6 }}
                        value={slot.sub_room_id ?? ''}
                        onChange={(e) => updateSlot(i, { sub_room_id: e.target.value === '' ? null : Number(e.target.value) })}
                        title="この枠のキャラが出現するサブ部屋（空欄なら入室時のプレイヤーの開始位置と同じ）"
                      >
                        <option value="">配置先: 開始位置と同じ</option>
                        {form.sub_rooms.map((sub, subIndex) => (
                          <option key={sub.id ?? `new-${subIndex}`} value={sub.id ?? `new-${subIndex}`} disabled={sub.id == null}>
                            配置先: {sub.name || '（無題）'}
                            {sub.id == null ? '（保存後に選択可）' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    <button onClick={() => removeSlot(i)}>削除</button>
                  </div>
                  <TagChips
                    tags={slot.attribute_tags}
                    onChange={(tags) => updateSlot(i, { attribute_tags: tags })}
                    placeholder="+ 属性キーを追加"
                  />
                </div>
              ))}
              {form.slots.length === 0 && <p style={{ fontSize: 12, color: '#888' }}>まだ枠がありません</p>}
            </div>
            <button style={{ marginTop: 6 }} onClick={addSlot}>
              + 枠を追加
            </button>
          </div>

          <div>
            <p style={{ marginBottom: 4 }}>プロファイル</p>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
              「今日はどんな出現キャラ・雰囲気の部屋か」を複数定義できます。「日替わり抽選」は日替わりでランダムに1つ選ばれ、部屋本体の属性キー/雰囲気より優先されます。「イベントのみ」は自動抽選されず、set_room_profileアクションから名指しされた時だけ有効になります（戦闘フィールド化など）。
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {form.profiles.map((profile, i) => (
                <div key={profile.id ?? `new-${i}`} style={{ border: '1px solid #eee', borderRadius: 6, padding: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 6 }}>
                    <input
                      style={{ flex: 1 }}
                      placeholder="プロファイル名（例：アイドルイベント）"
                      value={profile.name}
                      onChange={(e) => updateProfile(i, { name: e.target.value })}
                    />
                    <select
                      value={profile.selection_mode}
                      onChange={(e) => updateProfile(i, { selection_mode: e.target.value })}
                    >
                      <option value="random">日替わり抽選</option>
                      <option value="manual">イベントのみ</option>
                    </select>
                    {profile.selection_mode === 'random' && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
                        重み
                        <input
                          type="number"
                          min={0}
                          style={{ width: 48 }}
                          value={profile.weight}
                          onChange={(e) => updateProfile(i, { weight: e.target.value })}
                        />
                      </label>
                    )}
                    <button onClick={() => removeProfile(i)}>削除</button>
                  </div>
                  <p style={{ fontSize: 11, color: '#888', margin: '4px 0 2px' }}>出現キャラの属性キー（空欄なら部屋本体のまま）</p>
                  <TagChips
                    tags={profile.attribute_tags}
                    onChange={(tags) => updateProfile(i, { attribute_tags: tags })}
                    placeholder="+ 属性キーを追加"
                  />
                  <label style={{ display: 'block', marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: '#888' }}>雰囲気（空欄なら部屋本体のまま）</span>
                    <textarea
                      style={{ display: 'block', width: '100%', height: 36 }}
                      value={profile.atmosphere_text}
                      onChange={(e) => updateProfile(i, { atmosphere_text: e.target.value })}
                    />
                  </label>
                  <label style={{ display: 'block', marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: '#888' }}>場所（空欄なら部屋本体のまま）</span>
                    <textarea
                      style={{ display: 'block', width: '100%', height: 36 }}
                      value={profile.location_text}
                      onChange={(e) => updateProfile(i, { location_text: e.target.value })}
                    />
                  </label>
                </div>
              ))}
              {form.profiles.length === 0 && <p style={{ fontSize: 12, color: '#888' }}>まだプロファイルがありません</p>}
            </div>
            <button style={{ marginTop: 6 }} onClick={addProfile}>
              + プロファイルを追加
            </button>
          </div>

          <div>
            <p style={{ marginBottom: 4 }}>サブ部屋</p>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
              この部屋の中の区画（カフェの窓際席・商店街の各店舗など）を定義します。空欄の項目は部屋本体（またはアクティブなプロファイル）の値を引き継ぎます。プレイヤーはチャット画面の「場所を変える」から移動でき、「既定（入口）」に設定した1つから入室します（無ければ部屋本体から始まります）。同じ入口・同じセッションのまま軽く移る区画向けで、別の建物などは別の部屋として作ってください。
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {form.sub_rooms.map((sub, i) => (
                <div key={sub.id ?? `new-${i}`} style={{ border: '1px solid #eee', borderRadius: 6, padding: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4, gap: 6 }}>
                    <input
                      style={{ flex: 1 }}
                      placeholder="サブ部屋名（例：窓際の席）"
                      value={sub.name}
                      onChange={(e) => updateSubRoom(i, { name: e.target.value })}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
                      <input
                        type="checkbox"
                        checked={sub.is_default}
                        onChange={(e) => updateSubRoom(i, { is_default: e.target.checked })}
                      />
                      既定（入口）
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
                      移動コスト
                      <input
                        type="number"
                        min={0}
                        style={{ width: 48 }}
                        value={sub.enter_movement_cost}
                        onChange={(e) => updateSubRoom(i, { enter_movement_cost: e.target.value })}
                      />
                    </label>
                    <button onClick={() => moveSubRoom(i, -1)} disabled={i === 0} title="上へ">
                      ↑
                    </button>
                    <button onClick={() => moveSubRoom(i, 1)} disabled={i === form.sub_rooms.length - 1} title="下へ">
                      ↓
                    </button>
                    <button onClick={() => removeSubRoom(i)}>削除</button>
                  </div>
                  <label style={{ display: 'block', marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: '#888' }}>場所（空欄なら部屋本体のまま）</span>
                    <textarea
                      style={{ display: 'block', width: '100%', height: 36 }}
                      value={sub.location_text}
                      onChange={(e) => updateSubRoom(i, { location_text: e.target.value })}
                    />
                  </label>
                  <p style={{ fontSize: 11, color: '#888', margin: '4px 0 2px' }}>場所タグ（空欄なら部屋本体のまま）</p>
                  <TagChips
                    tags={sub.location_tags}
                    onChange={(tags) => updateSubRoom(i, { location_tags: tags })}
                    placeholder="+ 場所タグを追加"
                  />
                  <label style={{ display: 'block', marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: '#888' }}>雰囲気（空欄なら部屋本体のまま）</span>
                    <textarea
                      style={{ display: 'block', width: '100%', height: 36 }}
                      value={sub.atmosphere_text}
                      onChange={(e) => updateSubRoom(i, { atmosphere_text: e.target.value })}
                    />
                  </label>
                  <p style={{ fontSize: 11, color: '#888', margin: '4px 0 2px' }}>雰囲気タグ（空欄なら部屋本体のまま）</p>
                  <TagChips
                    tags={sub.atmosphere_tags}
                    onChange={(tags) => updateSubRoom(i, { atmosphere_tags: tags })}
                    placeholder="+ 雰囲気タグを追加"
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <div
                      style={{
                        width: 64,
                        height: 36,
                        borderRadius: 4,
                        background: sub.background_image_path ? `url(${sub.background_image_path}) center/cover` : '#eee',
                      }}
                    />
                    <span style={{ fontSize: 11, color: '#888' }}>背景画像（未設定なら部屋本体のまま）</span>
                    {isNew ? (
                      <span style={{ fontSize: 11, color: '#888' }}>部屋を保存してから設定できます</span>
                    ) : (
                      <input type="file" accept="image/*" onChange={(e) => handleSubRoomBackgroundUpload(i, e)} />
                    )}
                    {sub.background_image_path && (
                      <button onClick={() => updateSubRoom(i, { background_image_path: '' })}>画像を外す</button>
                    )}
                  </div>
                  {!isNew && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        style={{ fontSize: 12 }}
                        onClick={() => handleGenerateSubRoomBackground(i, 'fresh')}
                        disabled={subBgGeneratingIndex != null}
                        title="このサブ部屋の場所・雰囲気タグ（空なら部屋本体のタグ）から、背景画像を新規に生成します"
                      >
                        {subBgGeneratingIndex === i ? '生成中...' : '背景を新規生成'}
                      </button>
                      <button
                        type="button"
                        style={{ fontSize: 12 }}
                        onClick={() => handleGenerateSubRoomBackground(i, 'refine')}
                        disabled={subBgGeneratingIndex != null || !sub.background_image_path}
                        title={!sub.background_image_path ? '既存の背景画像がある場合のみ使用できます' : '現在の画像を基に調整して再生成'}
                      >
                        現在の画像から調整
                      </button>
                      <span style={{ fontSize: 11, color: '#888' }}>
                        スタイルは上の「どのWorldのスタイルで生成するか」の選択に従います。生成した画像は、部屋を保存すると反映されます。
                      </span>
                    </div>
                  )}
                  {subBgError?.index === i && <p style={{ color: 'red', fontSize: 11, margin: '2px 0 0' }}>エラー: {subBgError.message}</p>}

                  <p style={{ fontSize: 11, color: '#888', margin: '8px 0 2px', borderTop: '1px solid #eee', paddingTop: 6 }}>
                    商取引の上書き（未設定なら部屋本体のまま。「この店は食料しか置かない」のような店ごとの違いを表現できます）
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
                    <select
                      value={sub.is_shop == null ? 'inherit' : sub.is_shop ? 'true' : 'false'}
                      onChange={(e) =>
                        updateSubRoom(i, { is_shop: e.target.value === 'inherit' ? null : e.target.value === 'true' })
                      }
                    >
                      <option value="inherit">買い物: 部屋本体のまま</option>
                      <option value="true">買い物: できる</option>
                      <option value="false">買い物: できない</option>
                    </select>
                    <select
                      value={sub.outfit_acquisition_mode}
                      onChange={(e) => updateSubRoom(i, { outfit_acquisition_mode: e.target.value })}
                    >
                      <option value="">衣装入手: 部屋本体のまま</option>
                      <option value="none">衣装入手: なし</option>
                      <option value="shop">衣装入手: 購入</option>
                      <option value="pickup">衣装入手: 拾う</option>
                    </select>
                  </div>
                  {(sub.is_shop || sub.outfit_acquisition_mode) && (
                    <>
                      <p style={{ fontSize: 11, color: '#888', margin: '4px 0 2px' }}>
                        衣装の属性キー絞り込み（空欄なら部屋本体のまま）
                      </p>
                      <TagChips
                        tags={sub.outfit_attribute_tags}
                        onChange={(tags) => updateSubRoom(i, { outfit_attribute_tags: tags })}
                        placeholder="+ 属性キーを追加"
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 12 }}>
                        <span>品揃え数（空欄なら部屋本体のまま）</span>
                        <input
                          type="number"
                          min={0}
                          style={{ width: 48 }}
                          placeholder="最小"
                          value={sub.shop_lineup_min}
                          onChange={(e) => updateSubRoom(i, { shop_lineup_min: e.target.value })}
                        />
                        〜
                        <input
                          type="number"
                          min={0}
                          style={{ width: 48 }}
                          placeholder="最大"
                          value={sub.shop_lineup_max}
                          onChange={(e) => updateSubRoom(i, { shop_lineup_max: e.target.value })}
                        />
                        <select
                          value={sub.shop_lineup_refresh_unit}
                          onChange={(e) => updateSubRoom(i, { shop_lineup_refresh_unit: e.target.value })}
                        >
                          <option value="">更新周期: 部屋本体のまま</option>
                          <option value="turn">ターン毎</option>
                          <option value="time_slot">時間帯毎</option>
                          <option value="day">日毎</option>
                        </select>
                        <input
                          type="number"
                          min={0}
                          style={{ width: 48 }}
                          placeholder="間隔"
                          value={sub.shop_lineup_refresh_interval}
                          onChange={(e) => updateSubRoom(i, { shop_lineup_refresh_interval: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                  <p style={{ fontSize: 11, color: '#888', margin: '4px 0 2px' }}>
                    入手可能アイテムカテゴリの上書き（未選択なら部屋本体のカテゴリをそのまま使う。1つでも選ぶと完全に上書き）
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {itemCategories?.map((cat) => (
                      <label
                        key={cat.id}
                        style={{
                          fontSize: 12,
                          padding: '2px 7px',
                          borderRadius: 999,
                          border: '1px solid #ccc',
                          background: sub.item_category_ids.includes(cat.id) ? '#dbeafe' : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          style={{ marginRight: 4 }}
                          checked={sub.item_category_ids.includes(cat.id)}
                          onChange={() => toggleSubRoomItemCategory(i, cat.id)}
                        />
                        {cat.name}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {form.sub_rooms.length === 0 && <p style={{ fontSize: 12, color: '#888' }}>まだサブ部屋がありません</p>}
            </div>
            <button style={{ marginTop: 6 }} onClick={addSubRoom}>
              + サブ部屋を追加
            </button>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.turns_per_time_slot_enabled}
                onChange={(e) => setForm({ ...form, turns_per_time_slot_enabled: e.target.checked })}
              />
              この部屋の会話ターン数で自動的にルートの時間帯を進める
            </label>
            {form.turns_per_time_slot_enabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <span>何ターンで進めるか</span>
                <input
                  type="number"
                  min="1"
                  style={{ width: 70 }}
                  value={form.turns_per_time_slot}
                  onChange={(e) => setForm({ ...form, turns_per_time_slot: Number(e.target.value) })}
                />
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid #ddd', paddingTop: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.is_place}
                onChange={(e) => setForm({ ...form, is_place: e.target.checked })}
              />
              他の部屋とつながりのある「場所」として扱う（移動先はWorldごとの設定画面で設定できます）
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={form.ends_session_on_enter}
                onChange={(e) => setForm({ ...form, ends_session_on_enter: e.target.checked })}
              />
              この部屋に入ると場面を区切る（場面を継続するWorld設定でも、この部屋への移動では必ず新しい場面になります）
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={form.is_shop}
                onChange={(e) => setForm({ ...form, is_shop: e.target.checked })}
              />
              買い物できる部屋にする（貨幣を使用するWorldでは、この部屋でのアイテム入手に所持金が必要になります）
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={form.suppress_auto_population}
                onChange={(e) => setForm({ ...form, suppress_auto_population: e.target.checked })}
              />
              自動でキャラが現れない部屋にする（同行中のキャラのみ表示・タグ一致やランダム出現は無効）
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={form.reset_items_per_session}
                onChange={(e) => setForm({ ...form, reset_items_per_session: e.target.checked })}
              />
              部屋のアイテムをセッション毎にリセットする（売店には影響しません。入室のたびに探索候補が新しく抽選し直されます）
            </label>
          </div>

          <div style={{ borderTop: '1px solid #ddd', paddingTop: 10 }}>
            <p style={{ marginBottom: 4 }}>衣装の入手方法</p>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
              LLMの会話任せではなく、確定的に成立する「買い物」コマンド（もちものカテゴリ）向けの設定です。「購入できる」は上の「買い物できる部屋にする」と貨幣を使用するWorldであることが前提、「拾える」は無料でその場で入手できます（衣裳部屋など）。
            </p>
            <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="radio"
                  checked={form.outfit_acquisition_mode === 'none'}
                  onChange={() => setForm({ ...form, outfit_acquisition_mode: 'none' })}
                />
                なし
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="radio"
                  checked={form.outfit_acquisition_mode === 'shop'}
                  onChange={() => setForm({ ...form, outfit_acquisition_mode: 'shop' })}
                />
                購入できる
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="radio"
                  checked={form.outfit_acquisition_mode === 'pickup'}
                  onChange={() => setForm({ ...form, outfit_acquisition_mode: 'pickup' })}
                />
                拾える
              </label>
            </div>
            {form.outfit_acquisition_mode !== 'none' && (
              <div>
                <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
                  品揃えを絞る属性キー（衣装マスタ側の属性キーと1つでも一致すれば対象。空欄なら非売品以外の全衣装が対象）
                </p>
                <TagChips
                  tags={form.outfit_attribute_tags}
                  onChange={(tags) => setForm({ ...form, outfit_attribute_tags: tags })}
                  placeholder="+ 属性キーを追加"
                />
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid #ddd', paddingTop: 10 }}>
            <p style={{ marginBottom: 4 }}>品揃えのランダム表示（買い物・拾えるの両方に適用）</p>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
              対象が多いと毎回全件表示されて棚が薄まりがちな場合に使います。下限・上限を指定すると、条件に合う候補からその範囲でランダムに何点かだけ選んで表示します。アイテム・衣装それぞれ独立に抽選します。空欄なら今までどおり全件表示です。
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                下限
                <input
                  type="number"
                  min="0"
                  style={{ width: 60 }}
                  value={form.shop_lineup_min}
                  onChange={(e) => setForm({ ...form, shop_lineup_min: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                上限
                <input
                  type="number"
                  min="0"
                  style={{ width: 60 }}
                  value={form.shop_lineup_max}
                  onChange={(e) => setForm({ ...form, shop_lineup_max: e.target.value })}
                />
              </label>
            </div>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
              ラインナップの更新タイミング（下限・上限を指定した場合のみ有効）
            </p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12 }}>
              <select
                value={form.shop_lineup_refresh_unit}
                onChange={(e) => setForm({ ...form, shop_lineup_refresh_unit: e.target.value })}
              >
                <option value="turn">ターン数ごと</option>
                <option value="time_slot">時間帯ごと</option>
                <option value="day">日数ごと</option>
              </select>
              <input
                type="number"
                min="0"
                style={{ width: 60 }}
                value={form.shop_lineup_refresh_interval}
                onChange={(e) => setForm({ ...form, shop_lineup_refresh_interval: e.target.value })}
              />
            </div>
            <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              0にすると、見るたびに毎回ランダムに選び直します（品揃えを覚えておきません）。1以上なら、その回数分だけ単位が経過するまで同じ品揃えを保ちます。
            </p>
          </div>

          {!isNew && (
            <div style={{ borderTop: '1px solid #ddd', paddingTop: 10 }}>
              <p style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>アタッチ済みWorld</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {realAttachedWorlds.map((w) => (
                  <div
                    key={w.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, border: '1px solid #eee', borderRadius: 6, padding: '4px 8px' }}
                  >
                    <span style={{ flex: 1 }}>{w.name}</span>
                    <Link to={`/rooms/${id}/worlds/${w.id}`}>
                      <button>設定</button>
                    </Link>
                    <button onClick={() => detach.mutateAsync(w.id)}>切り離す</button>
                  </div>
                ))}
                {realAttachedWorlds.length === 0 && (
                  <p style={{ fontSize: 12, color: '#888' }}>
                    どのWorldにもアタッチされていません（未所属）。実際に使うにはいずれかのWorldへアタッチしてください。
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select style={{ flex: 1 }} value={attachWorldId} onChange={(e) => setAttachWorldId(e.target.value)}>
                  <option value="">アタッチするWorldを選択</option>
                  {attachCandidates.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <button onClick={handleAttachWorld} disabled={!attachWorldId}>
                  + アタッチ
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={() => navigate('/rooms')}>キャンセル</button>
        <button onClick={save} disabled={!form.name}>
          保存
        </button>
      </div>
    </div>
  );
}
