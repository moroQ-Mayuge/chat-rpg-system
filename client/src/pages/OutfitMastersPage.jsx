import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWorlds } from '../hooks/useWorlds.js';
import { useAllOutfitMasters, useOutfitMasterMutations, useOutfitMasterWorlds, useOutfitMasterWorldMutations } from '../hooks/useOutfitMasters.js';
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
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedExportIds, setSelectedExportIds] = useState(new Set());
  const queryClient = useQueryClient();

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

  function startEdit(m) {
    setEditingId(m.id);
    setForm(masterToForm(m));
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
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
    if (editingId != null) {
      await update.mutateAsync({ id: editingId, data: payload });
    } else {
      await create.mutateAsync(payload);
    }
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleDelete(id) {
    if (!window.confirm('この衣装マスタを削除しますか？')) return;
    if (editingId === id) cancelEdit();
    await remove.mutateAsync(id);
  }

  if (isLoading || worldsLoading) return <p>読み込み中...</p>;

  return (
    <div>
      <h2>衣装マスタ</h2>
      <p style={{ fontSize: 12, color: '#888' }}>
        キャラに依存しない共有の衣装定義です。キャラへの取り込み（完全コピー／参照）は別途キャラ編集画面から行います。
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <button disabled={selectedExportIds.size === 0} onClick={handleExportSelected}>
          選択した衣装マスタをエクスポート（{selectedExportIds.size}件）
        </button>
        <label>
          <span style={{ display: 'inline-block', border: '1px solid #ddd', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13 }}>
            インポート（zip）
          </span>
          <input type="file" accept=".zip" style={{ display: 'none' }} onChange={handleImportFile} />
        </label>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {masters.map((m) => (
          <div
            key={m.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 8,
              border: editingId === m.id ? '1px solid #2563eb' : '1px solid #ddd',
              borderRadius: 6,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={selectedExportIds.has(m.id)}
                onChange={() => toggleExportSelected(m.id)}
              />
              {m.name}
              {m.slot === 'underwear' && <span style={{ fontSize: 11, color: '#888' }}> [下着]</span>}
              {m.buy_price != null && <span style={{ fontSize: 11, color: '#888' }}> [¥{m.buy_price}]</span>}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => startEdit(m)}>編集</button>
              <button onClick={() => handleDelete(m.id)}>削除</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
        <p style={{ fontWeight: 500 }}>{editingId != null ? '編集' : '新規登録'}</p>
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
          {editingId != null && <button onClick={cancelEdit}>キャンセル</button>}
          <button onClick={handleSave} disabled={!form.name}>
            {editingId != null ? '保存' : '追加'}
          </button>
        </div>

        {editingId != null && <OutfitMasterWorldsSection masterId={editingId} worlds={worlds} />}
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
