import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCharacters,
  useCharacter,
  useCharacterMutations,
  useOutfitMutations,
  useCharacterWorlds,
  useCharacterWorldMutations,
} from '../hooks/useCharacters.js';
import { useExpressionTypes } from '../hooks/useExpressionTypes.js';
import { useWorlds } from '../hooks/useWorlds.js';
import { useAllOutfitMasters } from '../hooks/useOutfitMasters.js';
import DanbooruTagEditor from '../components/ui/DanbooruTagEditor.jsx';
import OutfitTagCategoryEditor, { OUTFIT_TAG_CATEGORIES, OUTFIT_TAG_FIELDS } from '../components/ui/OutfitTagCategoryEditor.jsx';
import TagChips from '../components/ui/TagChips.jsx';
import GroupedList from '../components/ui/GroupedList.jsx';
import { groupByKeys } from '../utils/grouping.js';
import { useMobileListToggle } from '../hooks/useMobileListToggle.js';
import { useLocalStorageState } from '../hooks/useLocalStorageState.js';
import { charactersApi } from '../api/characters.js';
import { outfitsApi } from '../api/outfits.js';
import { contentBundleApi, formatBundleImportSummary } from '../api/contentBundle.js';

// Mirrors server/src/services/attributeTagMatching.js's parseAttributeTags —
// that module lives server-side (imports db), so this is a small client
// copy rather than a shared import across the client/server boundary.
function parseAttributeTags(text) {
  return (text || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

const GROUP_AXES = [
  { value: 'world', label: '所属World' },
  { value: 'attribute', label: '属性キー' },
];

const BASIC_FIELDS = [
  ['name', '名前（愛称）'],
  ['full_name', '本名'],
  ['full_name_reading', '読み'],
  ['nickname', 'あだ名'],
  ['occupation', '職業'],
  ['age_real', '年齢（実年齢）'],
  ['age_apparent', '年齢（外見年齢）'],
  ['race', '種族'],
  ['attribute', '属性'],
];

const APPEARANCE_FIELDS = [
  ['appearance_features', '容姿特徴'],
  ['eye_description', '目色形状'],
  ['hair_description', '髪型髪色'],
  ['body_type', '体型'],
  ['bust_description', '胸大きさ形'],
  ['physical_features', '身体特徴'],
];

// キャラ本体（衣装非依存）の素体タグ。衣装側の同名フィールドが空の時だけ
// フォールバックとして使われる — server/src/services/outfitComposition.js
// の合成ルールに対応。
const BODY_TAG_FIELDS = [
  ['main_features', '主たる特徴（髪型以外の目の色・体形・キャラタグなど）'],
  ['hairstyle', '髪型'],
];

const PERSONALITY_FIELDS = [
  ['first_person', '一人称'],
  ['call_user_as', 'あなたの呼び方'],
  ['call_others_as', '他人の呼び方'],
  ['personality', '性格'],
  ['speech_style', '口調'],
  ['sentence_ending', '語尾'],
  ['behavior_principle', '行動原理'],
  ['social_tendency', '対人傾向'],
  ['habits', '癖口癖'],
  ['likes', '好物'],
  ['dislikes', '苦手'],
  ['skills', 'スキル技能'],
  ['special_skills', '特殊スキル'],
  ['weakness', '弱点'],
  ['secret', '秘密'],
  ['notes', '備考'],
];

// Pre-populated so a new character starts with a visible example rather than
// a blank list -- these are just a starting point, freely renamed/removed.
const DEFAULT_IMPRESSION_DEFAULTS = [
  { field_key: 'あなたとの関係', default_value: '' },
  { field_key: 'あなたの印象', default_value: '' },
];

const emptyForm = {
  ...Object.fromEntries([...BASIC_FIELDS, ...APPEARANCE_FIELDS, ...BODY_TAG_FIELDS, ...PERSONALITY_FIELDS].map(([key]) => [key, ''])),
  attribute_tags: '',
  is_mob: false,
  gender: '女性',
  cycle_enabled: false,
  cycle_offset_day: 0,
  impression_defaults: DEFAULT_IMPRESSION_DEFAULTS,
};

function FieldWithRoll({ label, value, onChange, onRoll, rolling }) {
  return (
    <div>
      <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input style={{ flex: 1 }} value={value} onChange={(e) => onChange(e.target.value)} />
        <button
          type="button"
          style={{ flexShrink: 0, fontSize: 11, padding: '4px 6px' }}
          onClick={onRoll}
          disabled={rolling}
          title="この項目だけをLLMで再生成"
        >
          {rolling ? '…' : '🎲'}
        </button>
      </div>
    </div>
  );
}

export default function CharactersPage() {
  const queryClient = useQueryClient();
  const { data: characters, isLoading: loadingList } = useCharacters();
  const { data: expressionTypes } = useExpressionTypes();
  const { data: worlds } = useWorlds();
  const [groupAxis, setGroupAxis] = useState('world');
  const [hideRouteScoped, setHideRouteScoped] = useLocalStorageState('characters:hideRouteScoped', false);
  const { mobileListOpen, openList, closeList } = useMobileListToggle();
  const [selectedId, setSelectedId] = useState(null);
  const isNew = selectedId === 'new';
  const { data: existing } = useCharacter(isNew || selectedId == null ? null : selectedId);
  const { create, update, remove } = useCharacterMutations();
  const outfitMutations = useOutfitMutations(isNew ? null : selectedId);
  const { data: allMasters } = useAllOutfitMasters();

  const [form, setForm] = useState(emptyForm);
  const [activeTab, setActiveTab] = useState('basic');
  const [activeOutfitId, setActiveOutfitId] = useState(null);
  const [masterPickerId, setMasterPickerId] = useState('');
  const [masterLinkMode, setMasterLinkMode] = useState('copy');
  const [policyHint, setPolicyHint] = useState('');
  const [pendingOutfitTags, setPendingOutfitTags] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [showPasteImport, setShowPasteImport] = useState(false);
  const [unmatchedSegments, setUnmatchedSegments] = useState([]);
  const [isGeneratingSheet, setIsGeneratingSheet] = useState(false);
  const [rollingField, setRollingField] = useState(null);
  const [assistError, setAssistError] = useState(null);
  const [generatingImageTarget, setGeneratingImageTarget] = useState(null);
  const [imageGenError, setImageGenError] = useState(null);
  const [expressionGenMode, setExpressionGenMode] = useState('');
  const [batchExpressionProgress, setBatchExpressionProgress] = useState(null);

  useEffect(() => {
    setPendingOutfitTags('');
    setPasteText('');
    setShowPasteImport(false);
    setUnmatchedSegments([]);
    setAssistError(null);
    if (!isNew) setPolicyHint('');
  }, [selectedId]);

  useEffect(() => {
    if (isNew) {
      setForm(emptyForm);
      setActiveOutfitId(null);
      return;
    }
    if (!existing) return;
    const fields = {};
    for (const [key] of [...BASIC_FIELDS, ...APPEARANCE_FIELDS, ...BODY_TAG_FIELDS, ...PERSONALITY_FIELDS]) {
      fields[key] = existing[key] ?? '';
    }
    fields.attribute_tags = existing.attribute_tags ?? '';
    fields.is_mob = Boolean(existing.is_mob);
    fields.gender = existing.gender ?? '';
    fields.cycle_enabled = Boolean(existing.cycle_enabled);
    fields.cycle_offset_day = existing.cycle_offset_day ?? 0;
    setForm({
      ...fields,
      relationship_defaults: existing.relationship_defaults,
      impression_defaults: existing.impression_defaults ?? [],
      outfits: existing.outfits,
    });
    if (existing.outfits?.length && !existing.outfits.find((o) => o.id === activeOutfitId)) {
      setActiveOutfitId(existing.outfits.find((o) => o.is_default)?.id ?? existing.outfits[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, isNew]);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function startNew() {
    setSelectedId('new');
    setActiveTab('basic');
    setPolicyHint('');
    setPendingOutfitTags('');
    setPasteText('');
    setShowPasteImport(false);
    setUnmatchedSegments([]);
    setAssistError(null);
    closeList();
  }

  function selectCharacter(id) {
    setSelectedId(id);
    closeList();
  }

  async function save() {
    const payload = Object.fromEntries([...BASIC_FIELDS, ...APPEARANCE_FIELDS, ...BODY_TAG_FIELDS, ...PERSONALITY_FIELDS].map(([key]) => [key, form[key]]));
    payload.relationship_defaults = form.relationship_defaults;
    payload.impression_defaults = form.impression_defaults;
    payload.attribute_tags = form.attribute_tags;
    payload.is_mob = form.is_mob;
    payload.gender = form.gender;
    payload.cycle_enabled = form.cycle_enabled;
    payload.cycle_offset_day = form.cycle_offset_day;
    if (isNew) {
      const created = await create.mutateAsync(payload);
      if (pendingOutfitTags && created.outfits?.[0]) {
        await outfitsApi.update(created.outfits[0].id, {
          name: created.outfits[0].name,
          clothing_description: created.outfits[0].clothing_description,
          equipment_description: created.outfits[0].equipment_description,
          main_features: pendingOutfitTags,
          is_default: true,
        });
      }
      setSelectedId(created.id);
    } else {
      await update.mutateAsync({ id: selectedId, data: payload });
    }
  }

  async function handleGenerateSheet() {
    if (!policyHint.trim()) return;
    setIsGeneratingSheet(true);
    setAssistError(null);
    try {
      const result = await charactersApi.generate(policyHint.trim());
      setForm((f) => ({ ...f, ...result.fields }));
      setPendingOutfitTags(result.suggestedTags.join(', '));
      setUnmatchedSegments(result.unmatchedSegments);
    } catch (err) {
      setAssistError(err.message);
    } finally {
      setIsGeneratingSheet(false);
    }
  }

  async function handlePasteImport() {
    if (!pasteText.trim()) return;
    setIsGeneratingSheet(true);
    setAssistError(null);
    try {
      const result = await charactersApi.parse(pasteText.trim());
      setForm((f) => ({ ...f, ...result.fields }));
      setPendingOutfitTags(result.suggestedTags.join(', '));
      setUnmatchedSegments(result.unmatchedSegments);
    } catch (err) {
      setAssistError(err.message);
    } finally {
      setIsGeneratingSheet(false);
    }
  }

  async function handleRollField(field) {
    setRollingField(field);
    setAssistError(null);
    try {
      const result = await charactersApi.generateField(field, policyHint.trim(), form);
      setField(field, result.value);
    } catch (err) {
      setAssistError(err.message);
    } finally {
      setRollingField(null);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('このキャラクターを削除しますか？')) return;
    await remove.mutateAsync(id);
    if (selectedId === id) setSelectedId(null);
  }

  function updateRelationshipDefault(axisId, value) {
    setForm((f) => ({
      ...f,
      relationship_defaults: f.relationship_defaults.map((d) =>
        d.relationship_axis_id === axisId ? { ...d, initial_value: value } : d,
      ),
    }));
  }

  function updateImpressionDefault(index, patch) {
    setForm((f) => ({
      ...f,
      impression_defaults: f.impression_defaults.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    }));
  }

  function addImpressionDefault() {
    setForm((f) => ({ ...f, impression_defaults: [...f.impression_defaults, { field_key: '', default_value: '' }] }));
  }

  function removeImpressionDefault(index) {
    setForm((f) => ({ ...f, impression_defaults: f.impression_defaults.filter((_, i) => i !== index) }));
  }

  async function addOutfit() {
    const name = window.prompt('新しい衣装の名前（例：私服）');
    if (!name) return;
    const outfit = await outfitMutations.create.mutateAsync({ name });
    setActiveOutfitId(outfit.id);
  }

  async function addOutfitFromMaster() {
    if (!masterPickerId) return;
    const outfit = await outfitMutations.createFromMaster.mutateAsync({
      outfit_master_id: Number(masterPickerId),
      link_mode: masterLinkMode,
    });
    setActiveOutfitId(outfit.id);
    setMasterPickerId('');
  }

  async function handleDetachMaster() {
    if (!activeOutfit) return;
    await outfitMutations.detachMaster.mutateAsync(activeOutfit.id);
  }

  const activeOutfit = form.outfits?.find((o) => o.id === activeOutfitId);
  const linkedMaster =
    activeOutfit?.outfit_master_id != null ? allMasters?.find((m) => m.id === activeOutfit.outfit_master_id) : null;

  // reference衣装は自身の19タグ列が常に空(server/src/services/outfitComposition.js
  // が読み出し時にマスタから解決する) -- タグの有無判定・画像生成のタグ上書き
  // 送信は、常に「実際に使われる値」＝マスタ側(見つかれば)を見る。
  function resolveTagSource() {
    if (activeOutfit?.link_mode === 'reference' && linkedMaster) return linkedMaster;
    return activeOutfit;
  }

  function updateActiveOutfitField(key, value) {
    setForm((f) => ({
      ...f,
      outfits: f.outfits.map((o) => (o.id === activeOutfitId ? { ...o, [key]: value } : o)),
    }));
  }

  // garment_operations (0065): which disturbance styles are visually
  // plausible for this specific garment field, toggled per style checkbox.
  function updateGarmentOperation(field, style, checked) {
    const current = activeOutfit.garment_operations?.[field] ?? [];
    const next = checked ? [...current, style] : current.filter((s) => s !== style);
    updateActiveOutfitField('garment_operations', { ...activeOutfit.garment_operations, [field]: next });
  }

  function currentOutfitTags() {
    const source = resolveTagSource();
    return Object.fromEntries(OUTFIT_TAG_FIELDS.map((key) => [key, source?.[key] ?? '']));
  }

  async function saveOutfit() {
    if (!activeOutfit) return;
    await outfitMutations.update.mutateAsync({
      id: activeOutfit.id,
      data: {
        name: activeOutfit.name,
        clothing_description: activeOutfit.clothing_description,
        equipment_description: activeOutfit.equipment_description,
        is_default: Boolean(activeOutfit.is_default),
        garment_operations: activeOutfit.garment_operations ?? {},
        ...currentOutfitTags(),
      },
    });
  }

  async function handleStandingImageUpload(e) {
    const file = e.target.files[0];
    if (!file || !activeOutfit) return;
    await outfitMutations.uploadStandingImage.mutateAsync({ id: activeOutfit.id, file });
  }

  async function handleExpressionImageUpload(expressionTypeId, e) {
    const file = e.target.files[0];
    if (!file || !activeOutfit) return;
    await outfitMutations.uploadExpressionImage.mutateAsync({ id: activeOutfit.id, expressionTypeId, file });
  }

  function confirmIfNoTags() {
    const source = resolveTagSource();
    const hasAnyTag = OUTFIT_TAG_FIELDS.some((key) => source?.[key]?.trim());
    if (hasAnyTag) return true;
    return window.confirm('服装タグが未設定ですが、このまま画像生成しますか？（意図せず裸体が生成される場合があります）');
  }

  // Sends the form's current (possibly unsaved) tag values along with the
  // generate request, so tweaking a tag and generating a preview no longer
  // requires saving the outfit first — the server prefers these over the
  // last-saved DB row when present (see routes/outfits.js's tagOverridesFromBody).
  async function handleGenerateStandingImage() {
    if (!activeOutfit || !confirmIfNoTags()) return;
    setGeneratingImageTarget('standing');
    setImageGenError(null);
    try {
      await outfitMutations.generateStandingImage.mutateAsync({ id: activeOutfit.id, tags: currentOutfitTags() });
    } catch (err) {
      setImageGenError(err.message);
    } finally {
      setGeneratingImageTarget(null);
    }
  }

  async function handleGenerateExpressionImage(expressionTypeId) {
    if (!activeOutfit || !confirmIfNoTags()) return;
    setGeneratingImageTarget(expressionTypeId);
    setImageGenError(null);
    try {
      await outfitMutations.generateExpressionImage.mutateAsync({
        id: activeOutfit.id,
        expressionTypeId,
        mode: expressionGenMode || undefined,
        tags: currentOutfitTags(),
      });
    } catch (err) {
      setImageGenError(err.message);
    } finally {
      setGeneratingImageTarget(null);
    }
  }

  // Fills in whatever this outfit is still missing, one at a time — image
  // generation is serialised server-side anyway (imageQueue.js), and going
  // one-by-one means a failure part way through leaves the successful ones in
  // place and re-running simply picks up where it stopped. Existing images are
  // never touched.
  async function handleGenerateMissingExpressions() {
    if (!activeOutfit || !confirmIfNoTags()) return;
    const missing = expressionTypes.filter(
      (et) => !activeOutfit.expression_images?.some((img) => img.expression_type_id === et.id),
    );
    if (missing.length === 0) return;

    setImageGenError(null);
    for (const [index, et] of missing.entries()) {
      setBatchExpressionProgress({ done: index, total: missing.length });
      setGeneratingImageTarget(et.id);
      try {
        await outfitMutations.generateExpressionImage.mutateAsync({
          id: activeOutfit.id,
          expressionTypeId: et.id,
          mode: expressionGenMode || undefined,
          tags: currentOutfitTags(),
        });
      } catch (err) {
        setImageGenError(`${et.name}の生成で失敗したため中断しました: ${err.message}`);
        break;
      } finally {
        setGeneratingImageTarget(null);
      }
    }
    setBatchExpressionProgress(null);
  }

  async function handleExportCharacter(id) {
    try {
      await contentBundleApi.exportCharacter(id);
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
      queryClient.invalidateQueries({ queryKey: ['characters'] });
    } catch (err) {
      window.alert(`インポートに失敗しました: ${err.message}`);
    }
  }

  if (loadingList || !expressionTypes || !worlds) return <p>読み込み中...</p>;

  // ルート固有キャラ(0079)は繰り返し遊ぶほど溜まるので、隠せるようにしておく。
  // World での絞り込みからは外していない（実際にその World のキャラではあるので、
  // World で絞ったときだけ消えるのは分かりにくい）。
  const visibleCharacters = hideRouteScoped ? characters.filter((c) => c.origin_playthrough_id == null) : characters;
  const routeScopedCount = characters.filter((c) => c.origin_playthrough_id != null).length;

  const characterGroups =
    groupAxis === 'world'
      ? groupByKeys(
          visibleCharacters,
          (c) => c.world_ids,
          (worldId) => worlds.find((w) => w.id === worldId)?.name ?? `World#${worldId}`,
          '未所属',
        )
      : groupByKeys(visibleCharacters, (c) => parseAttributeTags(c.attribute_tags), (tag) => tag, '未指定');

  function renderCharacterRow(c) {
    return (
      <div
        key={c.id}
        onClick={() => selectCharacter(c.id)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 6,
          borderRadius: 6,
          cursor: 'pointer',
          background: selectedId === c.id ? '#dbeafe' : 'transparent',
        }}
      >
        <span>
          {c.name}
          {c.origin_playthrough_id != null && (
            <span
              title="このルートでのみ登場します"
              style={{ marginLeft: 6, fontSize: 10, color: '#8a6d3b', border: '1px solid #d8c7a0', background: '#fdf8ec', borderRadius: 4, padding: '0 4px' }}
            >
              {c.origin_playthrough_name ?? 'ルート'}限定
            </span>
          )}
          {Boolean(c.is_auto_created) && c.origin_playthrough_id == null && (
            <span
              title="元になったルートが削除されたため、どの部屋にも自動では出てきません"
              style={{ marginLeft: 6, fontSize: 10, color: '#888', border: '1px solid #ccc', borderRadius: 4, padding: '0 4px' }}
            >
              ルート削除済み
            </span>
          )}
          {/* Boolean() は必須。is_mob は 0/1 の数値で来るので `c.is_mob && ...` は
              モブでないキャラの行に "0" をそのまま描いてしまう(実際に出ていた)。 */}
          {Boolean(c.is_mob) && (
            <span style={{ marginLeft: 6, fontSize: 10, color: '#888', border: '1px solid #ccc', borderRadius: 4, padding: '0 4px' }}>
              モブ
            </span>
          )}
        </span>
        <span style={{ display: 'flex', gap: 4 }}>
          <button
            style={{ fontSize: 11 }}
            onClick={(e) => {
              e.stopPropagation();
              handleExportCharacter(c.id);
            }}
          >
            エクスポート
          </button>
          <button
            style={{ fontSize: 11 }}
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(c.id);
            }}
          >
            削除
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className={`sidebar-layout${mobileListOpen ? ' mobile-list-open' : ''}`} style={{ '--sidebar-width': '220px' }}>
      <div className="sidebar-pane" style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRight: '1px solid #ddd', paddingRight: 12 }}>
        <div style={{ display: 'flex', gap: 6, fontSize: 12 }}>
          {GROUP_AXES.map((axis) => (
            <label key={axis.value} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
              <input type="radio" name="char-group-axis" checked={groupAxis === axis.value} onChange={() => setGroupAxis(axis.value)} />
              {axis.label}
            </label>
          ))}
        </div>
        {routeScopedCount > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={hideRouteScoped} onChange={(e) => setHideRouteScoped(e.target.checked)} />
            ルート限定キャラを隠す（{routeScopedCount}体）
          </label>
        )}
        <GroupedList groups={characterGroups} storageKey="characters" renderGroupItems={(group) => group.items.map(renderCharacterRow)} />
        <button onClick={startNew}>+ 新規キャラ</button>
        <label style={{ fontSize: 12, cursor: 'pointer' }}>
          インポート（zip）
          <input type="file" accept=".zip" onChange={handleImportBundle} style={{ display: 'none' }} />
        </label>
      </div>

      <div>
        <button className="mobile-list-toggle" onClick={openList} style={{ marginBottom: 8 }}>
          ☰ 一覧を表示
        </button>
        {selectedId == null && <p>左の一覧からキャラを選択するか、新規作成してください</p>}

        {selectedId != null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ border: '1px solid #93c5fd', borderRadius: 8, padding: 10 }}>
              <p style={{ fontWeight: 500, margin: '0 0 6px' }}>LLMでランダム作成</p>
              <p style={{ margin: '0 0 4px', fontSize: 12 }}>作成指示（自由記述）</p>
              <textarea
                style={{ width: '100%', height: 36 }}
                value={policyHint}
                onChange={(e) => setPolicyHint(e.target.value)}
                placeholder="例：勝気な幼馴染、スポーツ少女、方言あり"
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <button onClick={() => setShowPasteImport((v) => !v)}>
                  {showPasteImport ? '貼り付け登録を閉じる' : 'フォーマットを貼り付けて読み込む'}
                </button>
                <button onClick={handleGenerateSheet} disabled={!policyHint.trim() || isGeneratingSheet}>
                  {isGeneratingSheet ? '生成中...' : 'この指示でランダム生成'}
                </button>
              </div>

              {showPasteImport && (
                <div style={{ marginTop: 10, borderTop: '1px solid #ddd', paddingTop: 8 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 12 }}>
                    「キャラ情報：」から始まる形式のテキストを貼り付け
                  </p>
                  <textarea
                    style={{ width: '100%', height: 60 }}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="キャラ情報：みお/本名：.../..."
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                    <button onClick={handlePasteImport} disabled={!pasteText.trim() || isGeneratingSheet}>
                      {isGeneratingSheet ? '読み込み中...' : '貼り付けた内容を読み込む'}
                    </button>
                  </div>
                </div>
              )}

              {assistError && <p style={{ color: 'red', fontSize: 12 }}>エラー: {assistError}</p>}
              {unmatchedSegments.length > 0 && (
                <p style={{ fontSize: 11, color: '#a16207' }}>
                  認識できなかった項目：{unmatchedSegments.join(' / ')}
                </p>
              )}

              {pendingOutfitTags !== '' && (
                <div style={{ marginTop: 10, borderTop: '1px solid #ddd', paddingTop: 8 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 12 }}>
                    提案されたdanbooruタグ（デフォルト衣装に保存時に適用されます）
                  </p>
                  <DanbooruTagEditor value={pendingOutfitTags} onChange={setPendingOutfitTags} />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #ddd', paddingBottom: 6, flexWrap: 'wrap' }}>
              {[
                ['basic', '基本情報'],
                ['appearance', '外見・衣装'],
                ['personality', '性格・口調'],
                ['relationships', '関係性初期値'],
                ['impressions', 'あなたとの関係・印象'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  style={{ fontWeight: activeTab === key ? 700 : 400 }}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeTab === 'basic' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  {BASIC_FIELDS.map(([key, label]) => (
                    <FieldWithRoll
                      key={key}
                      label={label}
                      value={form[key]}
                      onChange={(v) => setField(key, v)}
                      onRoll={() => handleRollField(key)}
                      rolling={rollingField === key}
                    />
                  ))}
                </div>
                <div style={{ marginTop: 10 }}>
                  <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
                    属性キー（World・部屋の属性キーと一致すると自動登場/同席の対象になる）
                  </p>
                  <TagChips
                    tags={(form.attribute_tags || '').split(',').map((t) => t.trim()).filter(Boolean)}
                    onChange={(tags) => setField('attribute_tags', tags.join(', '))}
                    placeholder="例: 学生, 幼馴染"
                  />
                </div>
                <div style={{ marginTop: 10 }}>
                  <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>性別</p>
                  <select value={form.gender ?? ''} onChange={(e) => setField('gender', e.target.value)}>
                    <option value="女性">女性</option>
                    <option value="少女">少女</option>
                    <option value="男性">男性</option>
                    <option value="その他">その他</option>
                  </select>
                  <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                    キャラ情報に明示的に載ります。モデルによっては書かないと性別を取り違えるため、暗黙の想定に頼らず指定してください。
                  </p>
                </div>

                <div style={{ marginTop: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(form.cycle_enabled)}
                      onChange={(e) => setField('cycle_enabled', e.target.checked)}
                    />
                    妊娠しやすさの周期を持たせる
                  </label>
                  <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                    World設定側でも周期がONの時だけ有効になります。安全〜最危険の段階がキャラ情報に載り、イベント条件（flag_stateの
                    <code>cycle_phase</code>）からも参照できます。
                  </p>
                  {form.cycle_enabled && (
                    <div style={{ marginTop: 6 }}>
                      <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>周期のずらし日数</p>
                      <input
                        type="number"
                        min="0"
                        style={{ width: 80 }}
                        value={form.cycle_offset_day ?? 0}
                        onChange={(e) => setField('cycle_offset_day', Number(e.target.value) || 0)}
                      />
                      <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                        周期の開始日をずらす日数。全員が同じ日に同じ段階になるのを避けるためのもので、既定値はキャラごとに自動で散らしてあります。
                      </p>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(form.is_mob)}
                      onChange={(e) => setField('is_mob', e.target.checked)}
                    />
                    モブキャラ（関係値・呼び方・自己ステータスを部屋セッションごとにリセット）
                  </label>
                </div>

                {!isNew && <CharacterWorldsSection characterId={selectedId} worlds={worlds} />}
              </div>
            )}

            {activeTab === 'personality' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                {PERSONALITY_FIELDS.map(([key, label]) => (
                  <FieldWithRoll
                    key={key}
                    label={label}
                    value={form[key]}
                    onChange={(v) => setField(key, v)}
                    onRoll={() => handleRollField(key)}
                    rolling={rollingField === key}
                  />
                ))}
              </div>
            )}

            {activeTab === 'appearance' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
                  {APPEARANCE_FIELDS.map(([key, label]) => (
                    <FieldWithRoll
                    key={key}
                    label={label}
                    value={form[key]}
                    onChange={(v) => setField(key, v)}
                    onRoll={() => handleRollField(key)}
                    rolling={rollingField === key}
                  />
                  ))}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>素体タグ（衣装非依存・画像生成用danbooruタグ）</p>
                  <p style={{ fontSize: 11, color: '#888', margin: '0 0 6px' }}>
                    各衣装で個別に設定した場合はそちらが優先されます。空欄の衣装ではここの値が使われます。
                  </p>
                  {BODY_TAG_FIELDS.map(([key, label]) => (
                    <div key={key} style={{ marginBottom: 4 }}>
                      <p style={{ fontSize: 11, color: '#555' }}>{label}</p>
                      <DanbooruTagEditor value={form[key]} onChange={(v) => setField(key, v)} />
                    </div>
                  ))}
                </div>

                {isNew && <p>衣装・画像の設定は、まず基本情報タブで保存してから行えます。</p>}

                {!isNew && form.outfits && (
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500 }}>衣装バリエーション</p>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                      {form.outfits.map((o) => (
                        <button
                          key={o.id}
                          onClick={() => setActiveOutfitId(o.id)}
                          style={{
                            fontSize: 12,
                            padding: '4px 10px',
                            borderRadius: 999,
                            background: activeOutfitId === o.id ? '#dbeafe' : 'transparent',
                          }}
                        >
                          {o.name}
                          {Boolean(o.is_default) && ' (デフォルト)'}
                        </button>
                      ))}
                      <button onClick={addOutfit}>+ 追加</button>
                    </div>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', fontSize: 12 }}>
                      <select value={masterPickerId} onChange={(e) => setMasterPickerId(e.target.value)}>
                        <option value="">衣装マスタから追加...</option>
                        {(allMasters ?? []).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <input type="radio" checked={masterLinkMode === 'copy'} onChange={() => setMasterLinkMode('copy')} />
                        完全取り込み
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <input type="radio" checked={masterLinkMode === 'reference'} onChange={() => setMasterLinkMode('reference')} />
                        参照のみ
                      </label>
                      <button onClick={addOutfitFromMaster} disabled={!masterPickerId}>
                        + 追加
                      </button>
                    </div>

                    {activeOutfit && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                          <label>
                            衣装名
                            <input
                              style={{ display: 'block', width: '100%' }}
                              value={activeOutfit.name}
                              onChange={(e) => updateActiveOutfitField('name', e.target.value)}
                            />
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 20 }}>
                            <input
                              type="checkbox"
                              checked={Boolean(activeOutfit.is_default)}
                              onChange={(e) => updateActiveOutfitField('is_default', e.target.checked)}
                            />
                            デフォルト衣装にする
                          </label>
                          <label>
                            服装
                            <input
                              style={{ display: 'block', width: '100%' }}
                              value={activeOutfit.clothing_description}
                              onChange={(e) => updateActiveOutfitField('clothing_description', e.target.value)}
                            />
                          </label>
                          <label>
                            装備
                            <input
                              style={{ display: 'block', width: '100%' }}
                              value={activeOutfit.equipment_description}
                              onChange={(e) => updateActiveOutfitField('equipment_description', e.target.value)}
                            />
                          </label>
                        </div>

                        {activeOutfit.link_mode === 'reference' ? (
                          <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: 8, fontSize: 12, color: '#555' }}>
                            <p style={{ fontWeight: 500, marginBottom: 4 }}>
                              衣装マスタ「{linkedMaster?.name ?? '(削除済み)'}」を参照中（このマスタの内容がそのまま使われます。個別編集はできません）
                            </p>
                            {linkedMaster &&
                              OUTFIT_TAG_CATEGORIES.filter(([key]) => linkedMaster[key]?.trim()).map(([key, label]) => (
                                <p key={key} style={{ margin: '2px 0' }}>
                                  {label.replace(/※.*/, '')}: {linkedMaster[key]}
                                </p>
                              ))}
                            <button onClick={handleDetachMaster} style={{ marginTop: 8 }}>
                              個別編集に切り替える
                            </button>
                          </div>
                        ) : (
                          <>
                            {activeOutfit.outfit_master_id != null && (
                              <p style={{ fontSize: 11, color: '#888' }}>
                                衣装マスタ「{linkedMaster?.name ?? '(削除済み)'}」から取り込み済み（個別に編集できます）
                              </p>
                            )}
                            <OutfitTagCategoryEditor
                              values={activeOutfit}
                              onFieldChange={updateActiveOutfitField}
                              garmentOperations={activeOutfit.garment_operations}
                              onGarmentOperationChange={updateGarmentOperation}
                            />
                          </>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button onClick={saveOutfit}>この衣装を保存</button>
                        </div>

                        <div>
                          <p style={{ fontSize: 12, marginBottom: 4 }}>立ち絵イメージ（この衣装につき1枚）</p>
                          <div
                            style={{
                              width: 100,
                              aspectRatio: '9 / 16',
                              background: activeOutfit.standing_image_path
                                ? `url(${activeOutfit.standing_image_path}) center/cover`
                                : '#eee',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 11,
                              color: '#999',
                              marginBottom: 6,
                            }}
                          >
                            {!activeOutfit.standing_image_path && '未設定'}
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <label>
                              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleStandingImageUpload} />
                              <span style={{ display: 'inline-block', border: '1px solid #ccc', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
                                アップロード
                              </span>
                            </label>
                            <button
                              style={{ fontSize: 12 }}
                              onClick={handleGenerateStandingImage}
                              disabled={generatingImageTarget === 'standing'}
                            >
                              {generatingImageTarget === 'standing' ? '生成中...' : '画像生成'}
                            </button>
                          </div>
                          {imageGenError && <p style={{ color: 'red', fontSize: 11, marginTop: 4 }}>エラー: {imageGenError}</p>}
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <p style={{ fontSize: 12, margin: 0 }}>表情差分画像（この衣装の顔差分）</p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {(() => {
                                const missingCount = expressionTypes.filter(
                                  (et) => !activeOutfit.expression_images?.some((img) => img.expression_type_id === et.id),
                                ).length;
                                const running = batchExpressionProgress != null;
                                return (
                                  <button
                                    type="button"
                                    style={{ fontSize: 10 }}
                                    onClick={handleGenerateMissingExpressions}
                                    disabled={running || missingCount === 0 || generatingImageTarget != null}
                                    title="この衣装でまだ画像が無い表情だけを順に生成します（既存画像は上書きしません）"
                                  >
                                    {running
                                      ? `生成中... ${batchExpressionProgress.done + 1}/${batchExpressionProgress.total}`
                                      : `未作成をまとめて生成（${missingCount}）`}
                                  </button>
                                );
                              })()}
                            <label style={{ fontSize: 10, color: '#888' }}>
                              生成方式:{' '}
                              <select
                                style={{ fontSize: 10 }}
                                value={expressionGenMode}
                                onChange={(e) => setExpressionGenMode(e.target.value)}
                              >
                                <option value="">既定を使用</option>
                                <option value="anchor_i2i">参照画像アンカー（i2i）</option>
                                <option value="prompt_only">プロンプトのみ</option>
                              </select>
                            </label>
                            </div>
                          </div>
                          <div className="expression-grid">
                            {expressionTypes.map((et) => {
                              const existingImage = activeOutfit.expression_images?.find(
                                (img) => img.expression_type_id === et.id,
                              );
                              return (
                                <div key={et.id} style={{ textAlign: 'center' }}>
                                  <div
                                    style={{
                                      aspectRatio: '1',
                                      background: existingImage ? `url(${existingImage.image_path}) center/cover` : '#eee',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 11,
                                      color: '#999',
                                      marginBottom: 4,
                                    }}
                                  >
                                    {!existingImage && et.name}
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                                    <label>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        onChange={(e) => handleExpressionImageUpload(et.id, e)}
                                      />
                                      <span style={{ fontSize: 10, cursor: 'pointer', textDecoration: 'underline' }}>
                                        {existingImage ? '変更' : 'アップロード'}
                                      </span>
                                    </label>
                                    <button
                                      style={{ fontSize: 10, padding: '1px 4px' }}
                                      onClick={() => handleGenerateExpressionImage(et.id)}
                                      disabled={generatingImageTarget === et.id}
                                    >
                                      {generatingImageTarget === et.id ? '生成中...' : '画像生成'}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'relationships' && (
              <div>
                {isNew && <p>関係性初期値の調整は、まず基本情報タブで保存してから行えます。</p>}
                {!isNew && form.relationship_defaults && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {form.relationship_defaults.map((d) => (
                      <div key={d.relationship_axis_id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ width: 80, fontSize: 13 }}>{d.axis_name}</span>
                        <input
                          type="range"
                          min={d.min_value}
                          max={d.max_value}
                          value={d.initial_value}
                          onChange={(e) => updateRelationshipDefault(d.relationship_axis_id, Number(e.target.value))}
                          style={{ flex: 1 }}
                        />
                        <span style={{ width: 32, fontSize: 12, textAlign: 'right' }}>{d.initial_value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'impressions' && (
              <div>
                <p style={{ fontSize: 11, color: '#888', margin: '0 0 10px' }}>
                  「あなたとの関係」「あなたの印象」のような、プレイスルーを通じて持続する自由記述フィールドです。イベントのアクション「あなたとの関係印象を変更」や、Worldの自動更新設定（下記）で書き換えられます。ここで設定するのは新しいプレイスルー開始時の初期値です。
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(form.impression_defaults ?? []).map((d, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <input
                        style={{ width: 140, flexShrink: 0 }}
                        placeholder="フィールド名（例：あなたとの関係）"
                        value={d.field_key}
                        onChange={(e) => updateImpressionDefault(i, { field_key: e.target.value })}
                      />
                      <input
                        style={{ flex: 1 }}
                        placeholder="初期値（例：ただの知り合い）"
                        value={d.default_value}
                        onChange={(e) => updateImpressionDefault(i, { default_value: e.target.value })}
                      />
                      <button onClick={() => removeImpressionDefault(i)}>削除</button>
                    </div>
                  ))}
                </div>
                <button style={{ marginTop: 8 }} onClick={addImpressionDefault}>
                  + フィールドを追加
                </button>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={save} disabled={!form.name}>
                {isNew ? '作成' : '保存'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Explicit所属World（world_characters junction, additive to the two derived
// world_ids sources in charactersRepo.js's listCharacters -- see
// character_world_membership_and_list_ui_backlog item 1). Same pattern as
// CharacterStatusesPage.jsx's StatusWorldsSection.
function CharacterWorldsSection({ characterId, worlds }) {
  const { data: attachedWorlds } = useCharacterWorlds(characterId);
  const { attach, detach } = useCharacterWorldMutations(characterId);
  const [attachWorldId, setAttachWorldId] = useState('');

  const attachedIds = new Set((attachedWorlds ?? []).map((w) => w.id));
  const attachCandidates = (worlds ?? []).filter((w) => !attachedIds.has(w.id));

  async function handleAttach() {
    if (!attachWorldId) return;
    await attach.mutateAsync(Number(attachWorldId));
    setAttachWorldId('');
  }

  return (
    <div style={{ borderTop: '1px solid #ddd', paddingTop: 10, marginTop: 16 }}>
      <p style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>所属World（明示的アタッチ）</p>
      <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
        ここでのアタッチとは別に、固定枠割り当てや属性キー一致でも自動的に所属Worldとして表示されます。
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
        {(attachedWorlds ?? []).map((w) => (
          <div
            key={w.id}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, border: '1px solid #eee', borderRadius: 6, padding: '4px 8px' }}
          >
            <span style={{ flex: 1 }}>{w.name}</span>
            <button onClick={() => detach.mutateAsync(w.id)}>切り離す</button>
          </div>
        ))}
        {(attachedWorlds ?? []).length === 0 && <p style={{ fontSize: 12, color: '#888' }}>明示的なアタッチはありません</p>}
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
        <button onClick={handleAttach} disabled={!attachWorldId}>
          + アタッチ
        </button>
      </div>
    </div>
  );
}
