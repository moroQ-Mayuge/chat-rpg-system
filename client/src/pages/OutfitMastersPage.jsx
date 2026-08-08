import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWorlds } from '../hooks/useWorlds.js';
import { useAllOutfitMasters, useOutfitMasterMutations, useOutfitMasterWorlds, useOutfitMasterWorldMutations } from '../hooks/useOutfitMasters.js';
import { useMobileListToggle } from '../hooks/useMobileListToggle.js';
import { groupByKeys } from '../utils/grouping.js';
import GroupedList from '../components/ui/GroupedList.jsx';
import OutfitTagCategoryEditor, { OUTFIT_TAG_FIELDS } from '../components/ui/OutfitTagCategoryEditor.jsx';
import { contentBundleApi, formatBundleImportSummary } from '../api/contentBundle.js';

const emptyForm = {
  name: '',
  slot: 'normal',
  clothing_description: '',
  equipment_description: '',
  attribute_tags: '',
  garment_operations: {},
  buy_price: '',
  sell_price: '',
  ...Object.fromEntries(OUTFIT_TAG_FIELDS.map((key) => [key, ''])),
};

function masterToForm(m) {
  return {
    name: m.name,
    slot: m.slot ?? 'normal',
    clothing_description: m.clothing_description ?? '',
    equipment_description: m.equipment_description ?? '',
    attribute_tags: m.attribute_tags ?? '',
    garment_operations: m.garment_operations ?? {},
    buy_price: m.buy_price ?? '',
    sell_price: m.sell_price ?? '',
    ...Object.fromEntries(OUTFIT_TAG_FIELDS.map((key) => [key, m[key] ?? ''])),
  };
}

export default function OutfitMastersPage() {
  const { data: masters, isLoading } = useAllOutfitMasters();
  const { data: worlds, isLoading: worldsLoading } = useWorlds();
  const { create, update, remove } = useOutfitMasterMutations();
  const { mobileListOpen, openList, closeList } = useMobileListToggle();
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedExportIds, setSelectedExportIds] = useState(new Set());
  const queryClient = useQueryClient();

  const isNew = selectedId === 'new';

  function toggleExportSelected(id) {
    setSelectedExportIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleExportSelected() {
    if (selectedExportIds.size === 0) return;
    await contentBundleApi.exportOutfitMasters([...selectedExportIds]);
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const result = await contentBundleApi.import(file);
      window.alert(formatBundleImportSummary(result));
      queryClient.invalidateQueries({ queryKey: ['outfitMasters'] });
    } catch (err) {
      window.alert(`インポートに失敗しました: ${err.message}`);
    }
  }

  function startNew() {
    setSelectedId('new');
    setForm(emptyForm);
    closeList();
  }

  function selectMaster(m) {
    setSelectedId(m.id);
    setForm(masterToForm(m));
    closeList();
  }

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // garment_operations: which disturbance styles are visually plausible for
  // a given tag field -- same convention as CharactersPage.jsx's per-outfit
  // updateGarmentOperation, mirrored here since a master carries its own copy.
  function updateGarmentOperation(field, style, checked) {
    const current = form.garment_operations?.[field] ?? [];
    const next = checked ? [...current, style] : current.filter((s) => s !== style);
    setField('garment_operations', { ...form.garment_operations, [field]: next });
  }

  async function handleSave() {
    if (!form.name) return;
    // 空欄=非売品(null)。テキスト入力の''はサーバー側の`?? null`では素通りしない
    // ため、送信直前にここで変換する。
    const payload = {
      ...form,
      buy_price: form.buy_price === '' ? null : Number(form.buy_price),
      sell_price: form.sell_price === '' ? null : Number(form.sell_price),
    };
    if (isNew) {
      const created = await create.mutateAsync(payload);
      setSelectedId(created.id);
    } else {
      await update.mutateAsync({ id: selectedId, data: payload });
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('この衣装マスタを削除しますか？')) return;
    if (selectedId === id) setSelectedId(null);
    await remove.mutateAsync(id);
  }

  if (isLoading || worldsLoading) return <p>読み込み中...</p>;

  const masterGroups = groupByKeys(
    masters,
    (m) => [m.slot === 'underwear' ? 'underwear' : 'normal'],
    (key) => (key === 'underwear' ? '下着' : '通常衣装'),
    '未分類',
  );

  function renderMasterRow(m) {
    return (
      <div
        key={m.id}
        onClick={() => selectMaster(m)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 6,
          borderRadius: 6,
          cursor: 'pointer',
          background: selectedId === m.id ? '#dbeafe' : 'transparent',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={selectedExportIds.has(m.id)}
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggleExportSelected(m.id)}
          />
          {m.name}
          {m.buy_price != null && <span style={{ fontSize: 10, color: '#888' }}> [¥{m.buy_price}]</span>}
        </span>
        <button
          style={{ fontSize: 11 }}
          onClick={(e) => {
            e.stopPropagation();
            handleDelete(m.id);
          }}
        >
          削除
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2>衣装マスタ</h2>
      <p style={{ fontSize: 12, color: '#888' }}>
        キャラに依存しない共有の衣装定義です。キャラへの取り込み（完全コピー／参照）は別途キャラ編集画面から行います。
      </p>
      <div className={`sidebar-layout${mobileListOpen ? ' mobile-list-open' : ''}`} style={{ '--sidebar-width': '220px' }}>
        <div className="sidebar-pane" style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRight: '1px solid #ddd', paddingRight: 12 }}>
          <button disabled={selectedExportIds.size === 0} onClick={handleExportSelected} style={{ fontSize: 12 }}>
            選択をエクスポート（{selectedExportIds.size}件）
          </button>
          <GroupedList groups={masterGroups} storageKey="outfitMasters" renderGroupItems={(group) => group.items.map(renderMasterRow)} />
          <button onClick={startNew}>+ 新規登録</button>
          <label style={{ fontSize: 12, cursor: 'pointer' }}>
            インポート（zip）
            <input type="file" accept=".zip" style={{ display: 'none' }} onChange={handleImportFile} />
          </label>
        </div>

        <div>
          <button className="mobile-list-toggle" onClick={openList} style={{ marginBottom: 8 }}>
            ☰ 一覧を表示
          </button>
          {selectedId == null && <p>左の一覧から衣装マスタを選択するか、新規登録してください</p>}

          {selectedId != null && (
            <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
              <p style={{ fontWeight: 500 }}>{isNew ? '新規登録' : '編集'}</p>
              <label style={{ display: 'block', marginBottom: 8 }}>
                名前
                <input style={{ display: 'block', width: '100%' }} value={form.name} onChange={(e) => setField('name', e.target.value)} />
              </label>
              <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="radio" checked={form.slot === 'normal'} onChange={() => setField('slot', 'normal')} />
                  通常衣装
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="radio" checked={form.slot === 'underwear'} onChange={() => setField('slot', 'underwear')} />
                  下着（Worldの日次ランダム抽選の対象）
                </label>
              </div>
              <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
                「下着を上書きする」フラグ（水着など）はマスタではなく、キャラ側の各衣装インスタンスに個別に設定します。
              </p>
              <label style={{ display: 'block', marginBottom: 8 }}>
                服装（自由記述）
                <input
                  style={{ display: 'block', width: '100%' }}
                  value={form.clothing_description}
                  onChange={(e) => setField('clothing_description', e.target.value)}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 8 }}>
                装備（自由記述）
                <input
                  style={{ display: 'block', width: '100%' }}
                  value={form.equipment_description}
                  onChange={(e) => setField('equipment_description', e.target.value)}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: '#888' }}>属性キー（カンマ区切り。部屋での発見・購入条件などに使用予定）</span>
                <input
                  style={{ display: 'block', width: '100%' }}
                  placeholder="例：水着, 夏季限定"
                  value={form.attribute_tags}
                  onChange={(e) => setField('attribute_tags', e.target.value)}
                />
              </label>
              <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                <label style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, color: '#888', display: 'block' }}>販売価格（空欄なら非売品）</span>
                  <input
                    type="number"
                    style={{ display: 'block', width: '100%' }}
                    value={form.buy_price}
                    onChange={(e) => setField('buy_price', e.target.value)}
                  />
                </label>
                <label style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, color: '#888', display: 'block' }}>売却価格</span>
                  <input
                    type="number"
                    style={{ display: 'block', width: '100%' }}
                    value={form.sell_price}
                    onChange={(e) => setField('sell_price', e.target.value)}
                  />
                </label>
              </div>

              <OutfitTagCategoryEditor
                values={form}
                onFieldChange={setField}
                garmentOperations={form.garment_operations}
                onGarmentOperationChange={updateGarmentOperation}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button onClick={handleSave} disabled={!form.name}>
                  {isNew ? '追加' : '保存'}
                </button>
              </div>

              {!isNew && <OutfitMasterWorldsSection masterId={selectedId} worlds={worlds} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OutfitMasterWorldsSection({ masterId, worlds }) {
  const { data: attachedWorlds } = useOutfitMasterWorlds(masterId);
  const { attach, detach } = useOutfitMasterWorldMutations(masterId);
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
      <p style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>アタッチ済みWorld</p>
      <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
        どのWorldにもアタッチされていない場合は共通（全Worldで使用可能）として扱われます。
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
        {(attachedWorlds ?? []).length === 0 && <p style={{ fontSize: 12, color: '#888' }}>共通（全Worldで使用可能）</p>}
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
