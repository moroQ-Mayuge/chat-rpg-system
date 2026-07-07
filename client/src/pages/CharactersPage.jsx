import { useEffect, useState } from 'react';
import { useCharacters, useCharacter, useCharacterMutations, useOutfitMutations } from '../hooks/useCharacters.js';
import { useExpressionTypes } from '../hooks/useExpressionTypes.js';
import DanbooruTagEditor from '../components/ui/DanbooruTagEditor.jsx';
import { charactersApi } from '../api/characters.js';
import { outfitsApi } from '../api/outfits.js';

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

const emptyForm = Object.fromEntries(
  [...BASIC_FIELDS, ...APPEARANCE_FIELDS, ...PERSONALITY_FIELDS].map(([key]) => [key, '']),
);

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
  const { data: characters, isLoading: loadingList } = useCharacters();
  const { data: expressionTypes } = useExpressionTypes();
  const [selectedId, setSelectedId] = useState(null);
  const isNew = selectedId === 'new';
  const { data: existing } = useCharacter(isNew || selectedId == null ? null : selectedId);
  const { create, update, remove } = useCharacterMutations();
  const outfitMutations = useOutfitMutations(isNew ? null : selectedId);

  const [form, setForm] = useState(emptyForm);
  const [activeTab, setActiveTab] = useState('basic');
  const [activeOutfitId, setActiveOutfitId] = useState(null);
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
    for (const [key] of [...BASIC_FIELDS, ...APPEARANCE_FIELDS, ...PERSONALITY_FIELDS]) {
      fields[key] = existing[key] ?? '';
    }
    setForm({ ...fields, relationship_defaults: existing.relationship_defaults, outfits: existing.outfits });
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
  }

  async function save() {
    const payload = Object.fromEntries([...BASIC_FIELDS, ...APPEARANCE_FIELDS, ...PERSONALITY_FIELDS].map(([key]) => [key, form[key]]));
    payload.relationship_defaults = form.relationship_defaults;
    if (isNew) {
      const created = await create.mutateAsync(payload);
      if (pendingOutfitTags && created.outfits?.[0]) {
        await outfitsApi.update(created.outfits[0].id, {
          name: created.outfits[0].name,
          clothing_description: created.outfits[0].clothing_description,
          equipment_description: created.outfits[0].equipment_description,
          image_tags: pendingOutfitTags,
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

  async function addOutfit() {
    const name = window.prompt('新しい衣装の名前（例：私服）');
    if (!name) return;
    const outfit = await outfitMutations.create.mutateAsync({ name });
    setActiveOutfitId(outfit.id);
  }

  const activeOutfit = form.outfits?.find((o) => o.id === activeOutfitId);

  function updateActiveOutfitField(key, value) {
    setForm((f) => ({
      ...f,
      outfits: f.outfits.map((o) => (o.id === activeOutfitId ? { ...o, [key]: value } : o)),
    }));
  }

  async function saveOutfit() {
    if (!activeOutfit) return;
    await outfitMutations.update.mutateAsync({
      id: activeOutfit.id,
      data: {
        name: activeOutfit.name,
        clothing_description: activeOutfit.clothing_description,
        equipment_description: activeOutfit.equipment_description,
        image_tags: activeOutfit.image_tags,
        is_default: Boolean(activeOutfit.is_default),
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
    if (activeOutfit.image_tags?.trim()) return true;
    return window.confirm('服装タグが未設定ですが、このまま画像生成しますか？（意図せず裸体が生成される場合があります）');
  }

  async function handleGenerateStandingImage() {
    if (!activeOutfit || !confirmIfNoTags()) return;
    setGeneratingImageTarget('standing');
    setImageGenError(null);
    try {
      await outfitMutations.generateStandingImage.mutateAsync({ id: activeOutfit.id });
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
      });
    } catch (err) {
      setImageGenError(err.message);
    } finally {
      setGeneratingImageTarget(null);
    }
  }

  if (loadingList || !expressionTypes) return <p>読み込み中...</p>;

  return (
    <div className="sidebar-layout" style={{ '--sidebar-width': '180px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRight: '1px solid #ddd', paddingRight: 12 }}>
        {characters.map((c) => (
          <div
            key={c.id}
            onClick={() => setSelectedId(c.id)}
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
            <span>{c.name}</span>
            <button
              style={{ fontSize: 11 }}
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(c.id);
              }}
            >
              削除
            </button>
          </div>
        ))}
        <button onClick={startNew}>+ 新規キャラ</button>
      </div>

      <div>
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

                        <div>
                          <p style={{ fontSize: 12, marginBottom: 4 }}>画像生成用danbooruタグ</p>
                          <DanbooruTagEditor
                            value={activeOutfit.image_tags}
                            onChange={(v) => updateActiveOutfitField('image_tags', v)}
                          />
                        </div>

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
