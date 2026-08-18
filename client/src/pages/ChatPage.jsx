import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useRoomSession, useRoomSessionMutations, usePickupItems, usePickupItemMutation } from '../hooks/useRoomSession.js';
import { useRoomConnections } from '../hooks/useRoomTemplates.js';
import { useChatStream } from '../hooks/useChatStream.js';
import { playthroughsApi } from '../api/playthroughs.js';
import { useActionCommandsForWorld } from '../hooks/useActionCommands.js';
import { useInventory, useInventoryMutations, useOutfitInventory, useOutfitInventoryMutations } from '../hooks/usePlaythroughs.js';
import { useCharacterTransformationsForCharacter } from '../hooks/useCharacterTransformations.js';
import { useChatInputSettings, useImagePromptDisplaySettings } from '../hooks/useSettings.js';
import { useWorlds } from '../hooks/useWorlds.js';
import { useLocalStorageState } from '../hooks/useLocalStorageState.js';

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// After a send, extracts just the @mention tokens that were present in the
// draft (in their original order) so they can be restored to the input --
// used when chat_input_settings.clear_mentions_on_send is off (the default):
// the typed instruction disappears but selected mention targets don't have
// to be re-picked for the next message.
function extractMentionTokens(text, names) {
  const found = [];
  for (const name of names) {
    if (text.includes(`@${name}`)) found.push({ name, index: text.indexOf(`@${name}`) });
  }
  found.sort((a, b) => a.index - b.index);
  return found.map((f) => `@${f.name}`);
}

// Resolves which participant is currently @-mentioned first in the draft
// (mention order, not participant list order -- mirrors extractMentionTokens'
// own index-based ordering), for 脱衣 commands' mentioned-only status gating
// below. null when the draft has no recognized @mention yet.
function firstMentionedParticipant(draft, participants) {
  const names = participants.map((p) => p.name);
  const [firstToken] = extractMentionTokens(draft, names);
  if (!firstToken) return null;
  const name = firstToken.slice(1);
  return participants.find((p) => p.name === name) ?? null;
}

// Compact renderer for a status snapshot ({self_stats, statuses, stages} —
// same shape whether live (participant.status) or frozen at speak-time
// (message.status_snapshot)), gated per-category by the effective visibility
// for whichever display location is calling it (strip/panel/chat_log — see
// session.status_display_visibility). "stages" can hold more than one entry
// when multiple exclusive_group families (e.g. 関係 and undress_state) are
// active at once — all of them share the single "relationship_stage"
// visibility toggle.
function StatusInline({ status, visibility }) {
  if (!status || !visibility) return null;
  const parts = [];
  if (visibility.self_stat && status.self_stats.length > 0) {
    parts.push(status.self_stats.map((s) => `${s.name}:${s.value}`).join(' '));
  }
  if (visibility.status && status.statuses.length > 0) {
    parts.push(status.statuses.map((s) => `[${s.name}]`).join(''));
  }
  if (visibility.relationship_stage && status.stages?.length > 0) {
    parts.push(status.stages.map((s) => `《${s.name}》`).join(''));
  }
  if (parts.length === 0) return null;
  return <span style={{ fontSize: 9, color: '#666', marginLeft: 6 }}>{parts.join('　')}</span>;
}

const COMMAND_ICON_STYLE = {
  fontSize: 12,
  padding: '4px 8px',
  borderRadius: 14,
  border: '1px solid #ddd',
  background: '#fff',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const CATEGORY_PILL_STYLE = {
  ...COMMAND_ICON_STYLE,
  background: '#f3f4f6',
  fontWeight: 500,
};

const CATEGORY_PILL_STYLE_ACTIVE = {
  ...CATEGORY_PILL_STYLE,
  background: '#6366f1',
  color: '#fff',
  borderColor: '#6366f1',
};

// Every status id currently held by any session participant (both plain
// category statuses and exclusive_group "stage" statuses) -- used for
// visible_when_status_ids' any_present gating (2026-07-16 action-command
// categorization plan): a command with that field set only shows once at
// least one participant currently holds one of the listed statuses.
function activeStatusIdSet(participants) {
  const ids = new Set();
  for (const p of participants ?? []) {
    for (const s of p.status?.statuses ?? []) ids.add(s.id);
    for (const s of p.status?.stages ?? []) ids.add(s.id);
  }
  return ids;
}

// visible_when_room_template_ids (2026-07-20): same comma-list/any_present
// shape as visible_when_status_ids, checked against the current room
// instead of participant statuses. The two condition types combine with
// AND (a command hidden by either one stays hidden); within one condition
// type it's OR (any listed value matching is enough).
function commandVisible(cmd, activeIds, currentRoomTemplateId) {
  const requiredStatusIds = (cmd.visible_when_status_ids ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  if (requiredStatusIds.length > 0 && !requiredStatusIds.some((id) => activeIds.has(id))) return false;

  const requiredRoomIds = (cmd.visible_when_room_template_ids ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  if (requiredRoomIds.length > 0 && !requiredRoomIds.includes(currentRoomTemplateId)) return false;

  return true;
}

// Icon-based quick actions above the chat input (chat enhancement backlog
// item 3): 'keyword' commands submit their fixed text as if typed (an easy
// way to fire keyword-condition events without free-typing exact phrasing);
// the item_* types open a small inline panel instead of sending immediately.
// Commands with a non-empty `category` are grouped behind a category pill
// (and a subcategory pill below that, if any command in the category sets
// one) -- a PC98風コマンド選択メニュー layout agreed in the 2026-07-16
// categorization plan. Commands with no category (legacy / not yet tagged)
// render as a flat row, unchanged from before.
// 脱衣系コマンド（category === '脱衣'）は、同席者全員のOR判定ではなく
// @メンション先頭のキャラ1人の状態だけを見て表示/非表示を決める --
// 「服を脱がす」操作の対象はメンション先頭の1人に限定する仕様のため、他の
// 同席者がたまたま該当ステータスを持っていても表示に影響させない。それ以外の
// カテゴリのコマンドは従来通り同席者全員のOR判定（any_present）のまま。
const UNDRESS_COMMAND_CATEGORY = '脱衣';

// L3.4: which fields sit "above" a given layer in the undress cascade (アウター
// -> ベース -> 下着), matching outfitTagCategories.js's UPPER_CLOTHING_LAYERS/
// LOWER_CLOTHING_LAYERS/UNDERWEAR_REVEAL_CHAINS server-side. The outer layer
// has nothing above it (always operable on its own).
const LAYER_ABOVE = {
  clothing_upper_outer: [],
  clothing_upper: ['clothing_upper_outer'],
  underwear_upper: ['clothing_upper_outer', 'clothing_upper'],
  clothing_lower_outer: [],
  clothing_lower: ['clothing_lower_outer'],
  underwear_lower: ['clothing_lower_outer', 'clothing_lower'],
};

// A layer counts as "cleared" (no longer blocking the layer below it) once
// it's either absent from this outfit, fully removed (suppressed), or has
// any disturbance style/torn applied -- mirrors outfitTagCategories.js's
// isFieldAtLeastDisturbed.
function isLayerCleared(od, field) {
  if (!od.fieldsPresent[field]) return true;
  return od.suppressedFields.includes(field) || Boolean(od.disturbedFieldStyles[field]) || od.tornFields.includes(field);
}

// Dynamic visibility for a 脱衣 command that targets a specific garment layer
// + operation style (action_commands.disturbance_target_field/style, L3.4) --
// commands with neither set (every non-undress command, plus 脱衣 commands
// that don't represent a disturbance operation) are always visible here,
// unaffected. `od` is the mentioned participant's outfit_disturbance
// (roomSessionsRepo.js's attachParticipants), or null if they have no outfit.
function isDisturbanceCommandVisible(cmd, od) {
  const field = cmd.disturbance_target_field;
  if (!field) return true;
  if (!od || !od.fieldsPresent[field]) return false;
  if (!LAYER_ABOVE[field].every((f) => isLayerCleared(od, f))) return false;

  const style = cmd.disturbance_target_style;
  const alreadySuppressed = od.suppressedFields.includes(field);
  // Style (open/pull/lift/aside) and torn are independent axes, so the
  // "once chosen, locked" rule only applies among styles (L3.5) -- a garment
  // can be lifted AND torn at once, which is exactly the compound tag
  // outfitTagCategories.js's composeFieldValue already builds.
  const alreadyStyled = Boolean(od.disturbedFieldStyles[field]);
  const alreadyTorn = od.tornFields.includes(field);
  if (style === 'complete') return !alreadySuppressed;
  if (alreadySuppressed) return false;
  // Tearing stays available while the layer is merely disturbed -- only a
  // fully removed layer (above) or an already-torn one takes it away.
  if (style === 'torn') return !alreadyTorn;
  if (alreadyStyled) return false;
  return (od.garmentOperations?.[field] ?? []).includes(style);
}

function ActionCommandBar({ worldId, participants, mentionedParticipant, roomTemplateId, onKeywordSend, onOpenPanel }) {
  const { data: commands } = useActionCommandsForWorld(worldId);
  const [openCategory, setOpenCategory] = useState(null);
  const [openSubcategory, setOpenSubcategory] = useState(null);
  if (!commands || commands.length === 0) return null;

  const anyPresentIds = activeStatusIdSet(participants);
  const mentionedIds = activeStatusIdSet(mentionedParticipant ? [mentionedParticipant] : []);
  const visibleCommands = commands.filter(
    (cmd) =>
      commandVisible(cmd, cmd.category === UNDRESS_COMMAND_CATEGORY ? mentionedIds : anyPresentIds, roomTemplateId) &&
      isDisturbanceCommandVisible(cmd, mentionedParticipant?.outfit_disturbance),
  );

  const uncategorized = visibleCommands.filter((cmd) => !cmd.category);
  const categorized = visibleCommands.filter((cmd) => cmd.category);
  const categories = [...new Set(categorized.map((cmd) => cmd.category))];

  function runCommand(cmd) {
    if (cmd.command_type === 'keyword') onKeywordSend(cmd.keyword_text);
    else onOpenPanel(cmd);
  }

  function selectCategory(category) {
    setOpenSubcategory(null);
    setOpenCategory(openCategory === category ? null : category);
  }

  const currentCategoryCommands = categorized.filter((cmd) => cmd.category === openCategory);
  const subcategories = [...new Set(currentCategoryCommands.filter((cmd) => cmd.subcategory).map((cmd) => cmd.subcategory))];
  const hasUncategorizedInCurrentCategory = currentCategoryCommands.some((cmd) => !cmd.subcategory);
  const commandsToShow =
    subcategories.length === 0
      ? currentCategoryCommands
      : currentCategoryCommands.filter((cmd) => (openSubcategory ? cmd.subcategory === openSubcategory : !cmd.subcategory));

  return (
    <div style={{ marginBottom: 6, flexShrink: 0 }}>
      {(uncategorized.length > 0 || categories.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: openCategory ? 4 : 0 }}>
          {uncategorized.map((cmd) => (
            <button key={cmd.id} type="button" style={COMMAND_ICON_STYLE} onClick={() => runCommand(cmd)}>
              {cmd.icon} {cmd.label}
            </button>
          ))}
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              style={openCategory === category ? CATEGORY_PILL_STYLE_ACTIVE : CATEGORY_PILL_STYLE}
              onClick={() => selectCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
      )}

      {openCategory && subcategories.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
          {hasUncategorizedInCurrentCategory && (
            <button
              type="button"
              style={!openSubcategory ? CATEGORY_PILL_STYLE_ACTIVE : CATEGORY_PILL_STYLE}
              onClick={() => setOpenSubcategory(null)}
            >
              全般
            </button>
          )}
          {subcategories.map((sub) => (
            <button
              key={sub}
              type="button"
              style={openSubcategory === sub ? CATEGORY_PILL_STYLE_ACTIVE : CATEGORY_PILL_STYLE}
              onClick={() => setOpenSubcategory(sub)}
            >
              {sub}
            </button>
          ))}
        </div>
      )}

      {openCategory && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {commandsToShow.map((cmd) => (
            <button key={cmd.id} type="button" style={COMMAND_ICON_STYLE} onClick={() => runCommand(cmd)}>
              {cmd.icon} {cmd.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemCheckPanel({ playthroughId, onClose, isShop, currencyUnit, onSell }) {
  const { data: inventory, isLoading } = useInventory(playthroughId);
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8, marginBottom: 6, flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>持ち物</span>
        <button type="button" onClick={onClose} style={{ fontSize: 11 }}>
          閉じる
        </button>
      </div>
      {isLoading && <p style={{ fontSize: 12, color: '#888' }}>読み込み中...</p>}
      {inventory?.length === 0 && <p style={{ fontSize: 12, color: '#888' }}>何も持っていません</p>}
      {inventory?.map((entry) => (
        <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '2px 0' }}>
          <p style={{ fontSize: 12, margin: 0 }}>
            {entry.name} ×{entry.quantity}
            {/* Boolean()必須: is_consumableはSQLiteの0/1整数で来るため、素の
                `entry.is_consumable && (...)` は永続型の行に "0" を描いてしまう。 */}
            {Boolean(entry.is_consumable) && (
              <span
                title="「使う」と所持数が減ります"
                style={{ marginLeft: 6, fontSize: 10, color: '#888', border: '1px solid #ccc', borderRadius: 4, padding: '0 4px' }}
              >
                消費型
              </span>
            )}
            {entry.description && <span style={{ color: '#888' }}> — {entry.description}</span>}
          </p>
          {isShop && entry.sell_price != null && (
            <button type="button" style={{ fontSize: 11 }} onClick={() => onSell(entry.item_id)}>
              売る（{entry.sell_price}{currencyUnit}）
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// Offers only what this room can turn up, minus anything already taken this
// session (0071) — it used to list the World's entire item master, which grows
// with every ITEM_GRANT and so kept offering things that weren't there.
function ItemPickupPanel({ sessionId, onClose, onAcquired }) {
  const { data: items } = usePickupItems(sessionId);
  const pickUpItem = usePickupItemMutation(sessionId);

  async function pickUp(item) {
    if (pickUpItem.isPending) return;
    await pickUpItem.mutateAsync(item.id);
    onAcquired(`『${item.name}』を手に入れた。`);
    onClose();
  }

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8, marginBottom: 6, flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>アイテムを入手</span>
        <button type="button" onClick={onClose} style={{ fontSize: 11 }}>
          閉じる
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {(items ?? []).map((item) => (
          <button key={item.id} type="button" style={COMMAND_ICON_STYLE} onClick={() => pickUp(item)}>
            {item.name}
          </button>
        ))}
        {items?.length === 0 && <p style={{ fontSize: 12, color: '#888' }}>この場所で拾えそうな物はもう無いようだ</p>}
      </div>
    </div>
  );
}

// Looks for an already-typed "@名前" mention in the chat draft matching a
// current participant, so opening an item action panel doesn't force
// re-selecting a target the player already specified inline (e.g. having
// typed "@みお" then tapping "使う" should default the target to みお).
function detectMentionedParticipant(draft, participants) {
  const match = participants.find((p) => draft.includes(`@${p.name}`));
  return match ? String(match.character_id) : '';
}

// Generic panel for any item_use-type action command (World-defined, not a
// fixed "使う"/"渡す" pair — chat enhancement backlog item 9 follow-up).
// `command` carries the clicked command's label plus its consumes_item/
// transfers_to_target flags, which drive both the panel's own behavior and
// the wording of the chat line it posts.
function ItemActionPanel({ command, playthroughId, participants, draft, onClose, onSend }) {
  const { data: inventory } = useInventory(playthroughId);
  // 保有衣装(0096、itemsを介さない別経済)は「渡す」でのみ選択肢に混ぜる——
  // 「使う」「食べる」等、items専用のconsumes_item系コマンドには衣装の出番が無い。
  const { data: outfitInventory } = useOutfitInventory(playthroughId);
  const { useItem, transferItem } = useInventoryMutations(playthroughId);
  const { transferItem: transferOutfitItem } = useOutfitInventoryMutations(playthroughId);
  const [selectedKey, setSelectedKey] = useState('');
  const [targetId, setTargetId] = useState(() => detectMentionedParticipant(draft, participants));
  const [description, setDescription] = useState('');

  const itemEntries = (inventory ?? []).map((e) => ({
    kind: 'item',
    key: `item:${e.item_id}`,
    id: e.item_id,
    name: e.name,
    quantity: e.quantity,
    is_consumable: e.is_consumable,
  }));
  const outfitEntries = command.transfers_to_target
    ? (outfitInventory ?? []).map((e) => ({
        kind: 'outfit',
        key: `outfit:${e.outfit_master_id}`,
        id: e.outfit_master_id,
        name: e.name,
        quantity: e.quantity,
      }))
    : [];
  const entries = [...itemEntries, ...outfitEntries];

  async function submit() {
    const entry = entries.find((e) => e.key === selectedKey);
    if (!entry) return;
    const target = participants.find((p) => p.character_id === Number(targetId));

    if (command.transfers_to_target) {
      if (!target) return;
      if (entry.kind === 'outfit') {
        await transferOutfitItem.mutateAsync({ outfitMasterId: entry.id, quantity: 1, toCharacterId: target.character_id });
      } else {
        await transferItem.mutateAsync({ itemId: entry.id, quantity: 1, toCharacterId: target.character_id });
      }
      onSend(`『${entry.name}』を@${target.name}に${command.label}`);
      onClose();
      return;
    }

    // アイテム自身が消費型なら、コマンド側のconsumes_item設定に関わらず減らす
    // ——アイテム画面が以前から「消費型（このカテゴリのアイテムは『使う』で
    // 所持数が減る）」と説明していた挙動が未実装だったのを実装したもの。
    // 衣装エントリはis_consumableを持たない(undefined=falsy)ので影響しない。
    if (command.consumes_item || entry.is_consumable) {
      await useItem.mutateAsync({ itemId: entry.id, quantity: 1 });
    }
    const targetText = target ? `@${target.name}に` : '';
    const text = `『${entry.name}』を${targetText}${command.label}${description ? `：${description}` : ''}`;
    onSend(text);
    onClose();
  }

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8, marginBottom: 6, flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>アイテムを{command.label}</span>
        <button type="button" onClick={onClose} style={{ fontSize: 11 }}>
          閉じる
        </button>
      </div>
      {entries.length === 0 && <p style={{ fontSize: 12, color: '#888' }}>持ち物がありません</p>}
      {entries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>アイテム</span>
            <select style={{ width: '100%' }} value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)}>
              <option value="">選択してください</option>
              {entries.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.name} ×{entry.quantity}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>対象{command.transfers_to_target ? '' : '（任意）'}</span>
            <select style={{ width: '100%' }} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">{command.transfers_to_target ? '対象を選択してください' : '指定なし'}</option>
              {participants.map((p) => (
                <option key={p.id} value={p.character_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {!command.transfers_to_target && (
            <label>
              <span style={{ fontSize: 11, color: '#888', display: 'block' }}>詳細（任意）</span>
              <input
                style={{ width: '100%' }}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={`どのように${command.label}か`}
              />
            </label>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={submit} disabled={!selectedKey || (command.transfers_to_target && !targetId)}>
              {command.label}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// クラフト(1-snoopy-raccoon.md): 道具(所持品全体から1つ、消費しない)+材料
// (is_consumableカテゴリのアイテムのみ、複数行・数量指定、消費する)+使い方
// (自由記述、任意)を指定する。検証・消費はサーバ側(craft分岐)で確定するため、
// ここでは選択とテキスト組み立てのみ——ItemActionPanelと同じ役割分担。
function CraftPanel({ command, playthroughId, onClose, onCraft }) {
  const { data: inventory } = useInventory(playthroughId);
  const [toolKey, setToolKey] = useState('');
  const [materialRows, setMaterialRows] = useState([{ key: '', quantity: 1 }]);
  const [method, setMethod] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // 道具・材料とも所持品全体から選べる。材料を消費型カテゴリに限定していた
  // 時期があったが、「材料に選べるものが限定的すぎる」という指摘を受けて撤廃
  // ——何を材料にできるかの判断はLLM側（と、それ以前にプレイヤー自身）に委ねる。
  const toolEntries = inventory ?? [];
  const materialEntries = inventory ?? [];

  function updateRow(index, patch) {
    setMaterialRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setMaterialRows((rows) => [...rows, { key: '', quantity: 1 }]);
  }
  function removeRow(index) {
    setMaterialRows((rows) => rows.filter((_, i) => i !== index));
  }

  const tool = toolEntries.find((e) => String(e.item_id) === toolKey);
  const validMaterials = materialRows
    .map((r) => ({ ...r, entry: materialEntries.find((e) => String(e.item_id) === r.key) }))
    .filter((r) => r.entry && r.quantity > 0);

  async function submit() {
    if (!tool || validMaterials.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const materialsText = validMaterials.map((r) => `${r.entry.name}×${r.quantity}`).join('、');
      const text = `『${tool.name}』を使って${method ? `${method}、` : ''}${materialsText}でクラフトを試みる。`;
      await onCraft(text, {
        toolItemId: tool.item_id,
        materials: validMaterials.map((r) => ({ itemId: r.entry.item_id, quantity: r.quantity })),
        method,
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8, marginBottom: 6, flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>{command.label}</span>
        <button type="button" onClick={onClose} style={{ fontSize: 11 }}>
          閉じる
        </button>
      </div>
      {toolEntries.length === 0 && <p style={{ fontSize: 12, color: '#888' }}>持ち物がありません</p>}
      {toolEntries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>道具</span>
            <select style={{ width: '100%' }} value={toolKey} onChange={(e) => setToolKey(e.target.value)}>
              <option value="">選択してください</option>
              {toolEntries.map((entry) => (
                <option key={entry.item_id} value={entry.item_id}>
                  {entry.name} ×{entry.quantity}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 2 }}>材料</span>
            {materialRows.map((row, i) => {
              const rowEntry = materialEntries.find((e) => String(e.item_id) === row.key);
              return (
                <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                  <select style={{ flex: 1 }} value={row.key} onChange={(e) => updateRow(i, { key: e.target.value })}>
                    <option value="">選択してください</option>
                    {materialEntries.map((entry) => (
                      <option key={entry.item_id} value={entry.item_id}>
                        {entry.name} ×{entry.quantity}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    max={rowEntry?.quantity ?? 1}
                    style={{ width: 56 }}
                    value={row.quantity}
                    onChange={(e) => updateRow(i, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                  />
                  {materialRows.length > 1 && (
                    <button type="button" onClick={() => removeRow(i)} style={{ fontSize: 11 }}>
                      ×
                    </button>
                  )}
                </div>
              );
            })}
            <button type="button" onClick={addRow} style={{ fontSize: 11 }}>
              + 材料を追加
            </button>
          </div>

          <label>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>使い方（任意）</span>
            <input
              style={{ width: '100%' }}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="例：じっくり煮込む"
            />
          </label>

          {error && <p style={{ color: 'red', fontSize: 11 }}>エラー: {error}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={submit} disabled={!toolKey || validMaterials.length === 0 || submitting}>
              {submitting ? '実行中...' : command.label}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 「着る」パネル(実装順6、0096で保有衣装専用経済に置き換え)。ItemActionPanelと
// 違い、対象を先に選ぶ——プレイヤーはcharacters行を持たずoutfitsの対象になれ
// ないため、対象は常にNPC。選んだ対象"自身の"保有衣装(渡した衣装はその時点で
// 相手の手元にある、playthrough_outfit_inventory)を一覧する——items経由の
// outfit_master_idは見ないため、全件がそのまま着られるもの。
function ItemWearPanel({ command, playthroughId, sessionId, participants, onClose, onSend }) {
  const [targetId, setTargetId] = useState('');
  const { data: wearableItems } = useOutfitInventory(playthroughId, targetId ? Number(targetId) : null);
  const { wearOutfit } = useRoomSessionMutations(sessionId);
  const [outfitMasterId, setOutfitMasterId] = useState('');

  async function submit() {
    const entry = (wearableItems ?? []).find((e) => e.outfit_master_id === Number(outfitMasterId));
    const target = participants.find((p) => p.character_id === Number(targetId));
    if (!entry || !target) return;
    await wearOutfit.mutateAsync({ characterId: target.character_id, outfitMasterId: entry.outfit_master_id });
    onSend(`@${target.name}が『${entry.name}』を${command.label}`);
    onClose();
  }

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8, marginBottom: 6, flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>{command.label}</span>
        <button type="button" onClick={onClose} style={{ fontSize: 11 }}>
          閉じる
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label>
          <span style={{ fontSize: 11, color: '#888', display: 'block' }}>対象</span>
          <select
            style={{ width: '100%' }}
            value={targetId}
            onChange={(e) => {
              setTargetId(e.target.value);
              setOutfitMasterId('');
            }}
          >
            <option value="">対象を選択してください</option>
            {participants.map((p) => (
              <option key={p.id} value={p.character_id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {targetId && (
          <label>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>着せる衣装</span>
            {(wearableItems ?? []).length === 0 ? (
              <p style={{ fontSize: 12, color: '#888' }}>着られる持ち物がありません</p>
            ) : (
              <select style={{ width: '100%' }} value={outfitMasterId} onChange={(e) => setOutfitMasterId(e.target.value)}>
                <option value="">選択してください</option>
                {wearableItems.map((entry) => (
                  <option key={entry.outfit_master_id} value={entry.outfit_master_id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            )}
          </label>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={submit} disabled={!targetId || !outfitMasterId}>
            {command.label}
          </button>
        </div>
      </div>
    </div>
  );
}

// 「変身のお願い」パネル(実装順3)。ItemWearPanelと同じ「対象を先に選ぶ」形だが、
// 対象NPC"自身の"変身定義(character_transformationsはcharacter_id必須の1キャラ
// 専用)だけを選ばせる。変身の解除も意味のある選択肢なので、着る側と違い
// 変身先の選択自体は必須にしない(対象さえ選べば送信可)。
function TransformRequestPanel({ command, sessionId, participants, onClose, onSend }) {
  const [targetId, setTargetId] = useState('');
  const { data: transformations } = useCharacterTransformationsForCharacter(targetId ? Number(targetId) : null);
  const { transformRequest } = useRoomSessionMutations(sessionId);
  const [transformationId, setTransformationId] = useState('');

  async function submit() {
    const target = participants.find((p) => p.character_id === Number(targetId));
    if (!target) return;
    const value = transformationId === '' ? null : Number(transformationId);
    await transformRequest.mutateAsync({ characterId: target.character_id, transformationId: value });
    const chosen = (transformations ?? []).find((t) => t.id === value);
    onSend(`@${target.name}に${command.label}（${chosen ? chosen.name : '変身解除'}）`);
    onClose();
  }

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8, marginBottom: 6, flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>{command.label}</span>
        <button type="button" onClick={onClose} style={{ fontSize: 11 }}>
          閉じる
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label>
          <span style={{ fontSize: 11, color: '#888', display: 'block' }}>対象</span>
          <select
            style={{ width: '100%' }}
            value={targetId}
            onChange={(e) => {
              setTargetId(e.target.value);
              setTransformationId('');
            }}
          >
            <option value="">対象を選択してください</option>
            {participants.map((p) => (
              <option key={p.id} value={p.character_id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {targetId && (
          <label>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>変身先</span>
            <select style={{ width: '100%' }} value={transformationId} onChange={(e) => setTransformationId(e.target.value)}>
              <option value="">変身を解除する</option>
              {(transformations ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={submit} disabled={!targetId}>
            {command.label}
          </button>
        </div>
      </div>
    </div>
  );
}

function FreeActionPanel({ onClose, onSend }) {
  const [text, setText] = useState('');

  function submit() {
    const value = text.trim();
    if (!value) return;
    onSend(value);
    onClose();
  }

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8, marginBottom: 6, flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>自由入力</span>
        <button type="button" onClick={onClose} style={{ fontSize: 11 }}>
          閉じる
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          style={{ flex: 1 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="決まったコマンドにない行動を自由に記述"
          autoFocus
        />
        <button type="button" onClick={submit} disabled={!text.trim()}>
          送信
        </button>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, isLoading } = useRoomSession(id);
  const { sendMessage, craftItem, exit, move, setAccompanying, sellItem } = useRoomSessionMutations(id);
  const { data: playthrough } = useQuery({
    queryKey: ['playthroughs', session?.playthrough_id],
    queryFn: () => playthroughsApi.get(session.playthrough_id),
    enabled: session != null,
  });
  const { data: connections } = useRoomConnections(
    session?.room_is_place ? session.room_template_id : null,
    playthrough?.world_id,
  );
  const [draft, setDraft] = useState('');
  // Route param :id changes on room move without remounting ChatPage (same
  // route pattern), so leftover draft text -- including @mention tokens kept
  // around by clearDraftAfterSend's default "keep mentions" behavior --
  // otherwise survives into the new room and can reference a character who
  // isn't even present there anymore.
  useEffect(() => {
    setDraft('');
  }, [id]);
  const { data: worlds } = useWorlds();
  const world = worlds?.find((w) => w.id === playthrough?.world_id);
  // ルート単位で覚える。同じWorldの別ルートを始めれば、方針はもう一度出る。
  //
  // キーにルートIDを埋め込まないのは、useLocalStorageState が初期化時に一度しか
  // 読まないため。session はマウント直後 undefined なので、キーを動的にすると
  // 「まだ分からない」ときのキーで読み込み、後からキーだけ変わって値が付いてこない
  // (実際に、閉じたはずの宣言が再読み込みで戻ってきた)。1つのキーにIDの一覧を
  // 持つ形にすれば、キーは常に固定になる。
  const [dismissedPolicyRoutes, setDismissedPolicyRoutes] = useLocalStorageState('policyNotice:dismissedRoutes', []);
  const policyNoticeDismissed = session != null && dismissedPolicyRoutes.includes(session.playthrough_id);
  const dismissPolicyNotice = () =>
    setDismissedPolicyRoutes((prev) => [...new Set([...prev, session.playthrough_id])]);

  const [materializingId, setMaterializingId] = useState(null);
  const [materializeError, setMaterializeError] = useState(null);

  // 子をキャラとして起こすのはここだけ。機構は「戻る頃合いだ」と知らせるまでで
  // 止めてあり、実際に作るかはプレイヤーが決める（立ち絵も表情もこれから作る
  // 必要があり、勝手に始まっていて欲しい作業ではないため）。
  async function handleMaterializeChild(pregnancyId) {
    setMaterializingId(pregnancyId);
    setMaterializeError(null);
    try {
      const result = await playthroughsApi.materializeChild(session.playthrough_id, pregnancyId);
      queryClient.invalidateQueries({ queryKey: ['roomSessions', id] });
      queryClient.invalidateQueries({ queryKey: ['characters'] });
      alert(
        `「${result.child.name}」をキャラクターとして作成しました。立ち絵と表情、詳細設定（キャラ画面の「詳細をLLMで生成」ボタン）はキャラクター画面から行ってください。`,
      );
    } catch (err) {
      setMaterializeError(`子キャラの作成に失敗しました：${err.message}`);
    } finally {
      setMaterializingId(null);
    }
  }

  const [scenePanelOpen, setScenePanelOpen] = useState(true);
  const [itemPanel, setItemPanel] = useState(null);
  const { data: chatInputSettings } = useChatInputSettings();
  const { data: imagePromptDisplaySettings } = useImagePromptDisplaySettings();

  const { isGenerating, error: streamError, sceneChangeNotice, relationshipNotice, refusalNotice } = useChatStream(id, () => {
    queryClient.invalidateQueries({ queryKey: ['roomSessions', id] });
    // A message_complete event can be a purchase/sale narration (money_changed
    // fires alongside it), so keep the 所持金 display fresh too.
    queryClient.invalidateQueries({ queryKey: ['playthroughs'] });
  });

  // all_participants includes departed characters (unlike session.participants,
  // which is active-only and drives the live UI elsewhere) so past messages
  // from someone who since left still resolve a name/expression image
  // instead of "???".
  function participantFor(characterId) {
    return session?.all_participants.find((p) => p.character_id === characterId);
  }

  function expressionImageFor(characterId, emotionTag) {
    const participant = participantFor(characterId);
    return participant?.expression_images.find((img) => img.llm_tag_key === emotionTag)?.image_path ?? null;
  }

  // After a send, either fully clear the draft (clear_mentions_on_send=1) or
  // -- the default -- clear everything EXCEPT the @mention tokens that were
  // present, so a run of messages to the same target doesn't require
  // re-picking the mention each time.
  function clearDraftAfterSend(sentText) {
    if (chatInputSettings?.clear_mentions_on_send) {
      setDraft('');
      return;
    }
    const names = [...(session?.participants ?? []).map((p) => p.name), '周辺'];
    const tokens = extractMentionTokens(sentText, names);
    setDraft(tokens.length ? `${tokens.join(' ')} ` : '');
  }

  // Submitting with an empty draft is not a no-op: it's an explicit "continue
  // from here" trigger (no user action/speech), handled server-side by
  // generating the next turn without inserting a user message at all.
  async function handleSend() {
    const sentText = draft.trim();
    await sendMessage.mutateAsync(sentText);
    clearDraftAfterSend(sentText);
  }

  async function sendText(text) {
    await sendMessage.mutateAsync(text);
  }

  // クラフト(1-snoopy-raccoon.md): 材料の消費/tool_not_held・insufficient_material
  // による拒否は/room-sessions/:id/messagesのcraft分岐がサーバ側で検証済み・確定済み
  // ——ここは組み立てた申告文とcraft構造化データをそのまま渡すだけ。
  async function sendCraft(text, craft) {
    await craftItem.mutateAsync({ content: text, craft });
  }

  // Action-command keyword buttons used to discard whatever was typed in the
  // draft (including an @mention inserted via insertMention), silently
  // breaking any event whose action targets character_id: "mentioned" (e.g.
  // the undress-state commands) since mentionedCharacterIds would resolve to
  // empty. Prepending the current draft preserves the mention while leaving
  // the no-draft case (the vast majority of existing keyword commands)
  // unchanged.
  async function sendKeywordCommand(keywordText) {
    const combined = draft.trim() ? `${draft.trim()} ${keywordText}` : keywordText;
    await sendMessage.mutateAsync(combined);
    clearDraftAfterSend(combined);
  }

  // Toggle: re-clicking a mention that's already in the draft removes it
  // instead of appending a second copy. The draft is a single opaque string
  // (no structured token model), so "already present" is a substring search
  // -- the same approach resolveMentions() uses server-side.
  function insertMention(name) {
    setDraft((d) => {
      const token = `@${name}`;
      const pattern = new RegExp(`${escapeRegExp(token)}\\s*`);
      if (pattern.test(d)) return d.replace(pattern, '');
      return d ? `${d} ${token} ` : `${token} `;
    });
  }

  async function handleExit() {
    await exit.mutateAsync();
    navigate(`/playthroughs/${session.playthrough_id}/pick-room`);
  }

  async function handleMove(connectionId) {
    const result = await move.mutateAsync(connectionId);
    navigate(`/room-sessions/${result.session.id}/chat`);
  }

  async function toggleAccompanying(characterId, current) {
    await setAccompanying.mutateAsync({ characterId, isAccompanying: !current });
  }

  if (isLoading || !session || !playthrough) return <p>読み込み中...</p>;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0.75rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexShrink: 0 }}>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          {playthrough.name} ／ {playthrough.current_day}日目 {playthrough.current_time_slot_label} ／{' '}
          {playthrough.current_weather} ／ {session.current_location_text}
          {playthrough.currency_enabled && (
            <>
              {' '}
              ／ 所持金 {playthrough.money}
              {playthrough.currency_unit}
            </>
          )}
        </p>
        {!session.room_is_place && <button onClick={handleExit}>部屋を退出する</button>}
      </div>

      {session.room_is_place && (
        <details style={{ marginBottom: 6, flexShrink: 0 }} open={(connections?.length ?? 0) <= 3}>
          <summary style={{ fontSize: 11, color: '#888', cursor: 'pointer' }}>移動先（{connections?.length ?? 0}）</summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {(connections ?? []).map((c) => (
              <button key={c.id} onClick={() => handleMove(c.id)} style={{ fontSize: 12 }}>
                → {c.to_room_name}
                {c.label && `（${c.label}）`} [消費{c.movement_cost}]
              </button>
            ))}
            {connections?.length === 0 && <span style={{ fontSize: 11, color: '#888' }}>移動先が設定されていません</span>}
          </div>
        </details>
      )}

      <details style={{ marginBottom: 6, flexShrink: 0 }} open={session.participants.length <= 3}>
        <summary style={{ fontSize: 11, color: '#888', cursor: 'pointer' }}>参加キャラ（{session.participants.length}）</summary>
        <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
          {session.participants.length === 0
            ? 'なし'
            : session.participants.map((p) => (
                <span key={p.id} style={{ marginRight: 8 }}>
                  {p.name}
                  <StatusInline status={p.status} visibility={session.status_display_visibility.strip} />
                  {session.room_is_place && (
                    <button
                      type="button"
                      onClick={() => toggleAccompanying(p.character_id, p.is_accompanying)}
                      style={{
                        fontSize: 10,
                        marginLeft: 3,
                        padding: '1px 5px',
                        borderRadius: 8,
                        border: '1px solid #ccc',
                        background: p.is_accompanying ? '#dbeafe' : 'transparent',
                        color: p.is_accompanying ? '#2563eb' : '#888',
                        cursor: 'pointer',
                      }}
                      title="移動時に同行させるか"
                    >
                      {p.is_accompanying ? '同行中' : '同行させる'}
                    </button>
                  )}
                </span>
              ))}
        </p>
      </details>

      {Object.values(session.status_display_visibility.panel).some(Boolean) && (
        <details style={{ marginBottom: 6, flexShrink: 0 }}>
          <summary style={{ fontSize: 11, color: '#888', cursor: 'pointer' }}>ステータスパネル</summary>
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {session.participants.map((p) => (
              <div key={p.id} style={{ fontSize: 11 }}>
                <strong>{p.name}</strong>
                <StatusInline status={p.status} visibility={session.status_display_visibility.panel} />
              </div>
            ))}
          </div>
        </details>
      )}

      {/* 作者からプレイヤーへのプレイ方針(0081)。ルートごとに一度だけ出して、
          閉じたら二度と出ない。LLMには渡さないし、何も止めない——「良心に任せる」
          をそのまま実装したもの。 */}
      {world?.policy_notice?.trim() && !policyNoticeDismissed && (
        <div
          style={{
            marginBottom: 6,
            flexShrink: 0,
            border: '1px solid #c9d6e8',
            background: '#f4f8fd',
            borderRadius: 6,
            padding: '6px 8px',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}
        >
          <p style={{ fontSize: 12, color: '#3c5a80', margin: 0, flex: 1, whiteSpace: 'pre-wrap' }}>{world.policy_notice}</p>
          <button style={{ fontSize: 11 }} onClick={dismissPolicyNotice}>
            閉じる
          </button>
        </div>
      )}

      {/* 出産済みで登場を待っている子。頃合いが来ても機構は勝手にキャラを作らず、
          知らせるところまでで止める（実際に起こすかはプレイヤーが決める）。 */}
      {(session.pending_children ?? []).some((c) => c.ready) && (
        <div
          style={{
            marginBottom: 6,
            flexShrink: 0,
            border: '1px solid #d8c7a0',
            background: '#fdf8ec',
            borderRadius: 6,
            padding: '6px 8px',
          }}
        >
          {session.pending_children
            .filter((c) => c.ready)
            .map((c) => (
              <div key={c.pregnancy_id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 12, color: '#6b5a2e', margin: 0, flex: 1 }}>
                  {c.mother_name}の子{c.child_name ? `「${c.child_name}」` : ''}が戻る頃合いになりました。
                </p>
                <button
                  style={{ fontSize: 11 }}
                  disabled={materializingId === c.pregnancy_id}
                  onClick={() => handleMaterializeChild(c.pregnancy_id)}
                >
                  {materializingId === c.pregnancy_id ? '作成中...' : 'キャラクターとして迎える'}
                </button>
              </div>
            ))}
          {materializeError && (
            <p style={{ fontSize: 11, color: '#b00', margin: '4px 0 0' }}>{materializeError}</p>
          )}
        </div>
      )}

      {/* 妊娠しやすさの段階は日付から導出しているだけで画面のどこにも出ないため、
          確認用にここへ出す。周期が有効なキャラが1人もいなければ欄ごと出ない。 */}
      {(session.participants.some((p) => p.cycle_debug) || (session.pending_children ?? []).length > 0) && (
        <details style={{ marginBottom: 6, flexShrink: 0 }}>
          <summary style={{ fontSize: 11, color: '#888', cursor: 'pointer' }}>デバッグ情報</summary>
          <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: 6, marginTop: 4, background: '#fafafa' }}>
            {(session.pending_children ?? []).map((c) => (
              <p key={`child-${c.pregnancy_id}`} style={{ fontSize: 11, color: '#666', margin: '0 0 2px' }}>
                {c.mother_name}の子{c.child_name ? `「${c.child_name}」` : ''}：
                {c.waitingForTimeSkip ? (
                  <strong>{c.ready ? '登場可能（時間跳躍済み）' : '次の時間跳躍で登場'}</strong>
                ) : (
                  <>
                    <strong>{c.ready ? '登場可能' : `あと${c.daysRemaining}日`}</strong>（出産から{c.daysSinceBirth}/
                    {c.maturationDays}日）
                  </>
                )}
              </p>
            ))}
            {session.participants
              .filter((p) => p.cycle_debug)
              .map((p) => (
                <p key={p.id} style={{ fontSize: 11, color: '#666', margin: '0 0 2px' }}>
                  {p.cycle_debug.pregnancy ? (
                    <>
                      {p.name}：<strong>妊娠中・{p.cycle_debug.pregnancy.stage}</strong>（
                      {p.cycle_debug.pregnancy.day}/{p.cycle_debug.pregnancy.gestationDays}日目
                      {p.cycle_debug.pregnancy.known ? '' : '・本人は気づいていない'}）
                    </>
                  ) : (
                    <>
                      {p.name}：妊娠しやすさ <strong>{p.cycle_debug.phase}</strong>（周期
                      {p.cycle_debug.dayInCycle}/{p.cycle_debug.cycleLength}日目）
                    </>
                  )}
                </p>
              ))}
          </div>
        </details>
      )}

      <div style={{ marginBottom: 6, flexShrink: 0 }}>
        <button onClick={() => setScenePanelOpen((v) => !v)} style={{ fontSize: 11 }}>
          {scenePanelOpen ? '現在のシーンを閉じる' : '現在のシーンを表示'}
        </button>
        {scenePanelOpen && (
          <div
            style={{
              marginTop: 6,
              aspectRatio: '16 / 9',
              maxWidth: 320,
              background: (session.current_scene_image_path || session.room_background_image_path)
                ? `url(${session.current_scene_image_path || session.room_background_image_path}) center/cover`
                : '#eee',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              color: '#999',
            }}
          >
            {!session.current_scene_image_path && !session.room_background_image_path && '背景未設定'}
          </div>
        )}
      </div>

      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8, flex: 1, minHeight: 0, overflowY: 'auto', marginBottom: 8 }}>
        {session.messages.map((m) => {
          if (m.content_type === 'image') {
            return (
              <div key={m.id} style={{ margin: '8px 0', textAlign: 'center' }}>
                <img src={m.image_path} alt="シーン" style={{ maxWidth: '100%', borderRadius: 8 }} />
                {imagePromptDisplaySettings?.show_image_generation_prompt && m.prompt && (
                  <details style={{ textAlign: 'left', marginTop: 4 }}>
                    <summary style={{ fontSize: 11, color: '#888', cursor: 'pointer' }}>生成プロンプト</summary>
                    <p style={{ fontSize: 11, color: '#666', whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{m.prompt}</p>
                  </details>
                )}
              </div>
            );
          }
          if (m.sender_type === 'narration') {
            return (
              <div key={m.id} style={{ margin: '6px 0', textAlign: 'center' }}>
                <span style={{ fontSize: 12, color: '#888', fontStyle: 'italic' }}>{m.content}</span>
              </div>
            );
          }
          const isUser = m.sender_type === 'user';
          const imagePath = !isUser ? expressionImageFor(m.character_id, m.emotion_tag) : null;
          const participant = !isUser ? participantFor(m.character_id) : null;
          return (
            <div key={m.id} style={{ marginBottom: 6, textAlign: isUser ? 'right' : 'left' }}>
              {!isUser && (
                <p style={{ fontSize: 10, color: '#888', margin: '0 0 2px' }}>
                  {participant?.name ?? '???'} {m.emotion_tag && `[${m.emotion_tag}]`}
                  {m.sender_type === 'character' && (
                    <StatusInline status={m.status_snapshot} visibility={session.status_display_visibility.chat_log} />
                  )}
                </p>
              )}
              <div style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 8 }}>
                {!isUser && (
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 10,
                      background: imagePath ? `url(${imagePath}) center/cover` : '#eee',
                      flexShrink: 0,
                    }}
                  />
                )}
                <span
                  style={{
                    display: 'inline-block',
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: isUser ? '#eee' : '#dbeafe',
                    fontSize: 13,
                  }}
                >
                  {m.content}
                </span>
              </div>
            </div>
          );
        })}
        {session.messages.length === 0 && !isGenerating && <p style={{ color: '#999', fontSize: 12 }}>まだメッセージがありません</p>}
        {isGenerating && (
          <div style={{ marginBottom: 6, textAlign: 'left' }}>
            <span style={{ display: 'inline-block', padding: '6px 10px', fontSize: 12, color: '#888' }}>入力中…</span>
          </div>
        )}
        {sceneChangeNotice && (
          <div style={{ textAlign: 'center', margin: '6px 0' }}>
            <span style={{ fontSize: 10, color: '#a16207', border: '1px dashed #a16207', borderRadius: 4, padding: '2px 6px' }}>
              [SCENE_CHANGE] {sceneChangeNotice}
            </span>
          </div>
        )}
        {relationshipNotice && (
          <div style={{ textAlign: 'center', margin: '6px 0' }}>
            <span style={{ fontSize: 10, color: '#be185d', border: '1px dashed #be185d', borderRadius: 4, padding: '2px 6px' }}>
              💗 {relationshipNotice}
            </span>
          </div>
        )}
        {refusalNotice && (
          <div style={{ textAlign: 'center', margin: '6px 0' }}>
            <span style={{ fontSize: 10, color: '#888', border: '1px dashed #888', borderRadius: 4, padding: '2px 6px' }}>
              ⚠ {refusalNotice}
            </span>
          </div>
        )}
        {streamError && <p style={{ color: 'red', fontSize: 12 }}>エラー: {streamError}</p>}
      </div>

      {itemPanel?.command_type === 'item_check' && (
        <ItemCheckPanel
          playthroughId={session.playthrough_id}
          onClose={() => setItemPanel(null)}
          isShop={Boolean(session.room_is_shop) && Boolean(playthrough?.currency_enabled)}
          currencyUnit={playthrough?.currency_unit}
          onSell={(itemId) => sellItem.mutate(itemId)}
        />
      )}
      {itemPanel?.command_type === 'item_pickup' && (
        <ItemPickupPanel sessionId={id} onClose={() => setItemPanel(null)} onAcquired={sendText} />
      )}
      {itemPanel?.command_type === 'item_use' && (
        <ItemActionPanel
          command={itemPanel}
          playthroughId={session.playthrough_id}
          participants={session.participants}
          draft={draft}
          onClose={() => setItemPanel(null)}
          onSend={sendText}
        />
      )}
      {itemPanel?.command_type === 'item_wear' && (
        <ItemWearPanel
          command={itemPanel}
          playthroughId={session.playthrough_id}
          sessionId={id}
          participants={session.participants}
          onClose={() => setItemPanel(null)}
          onSend={sendText}
        />
      )}
      {itemPanel?.command_type === 'transform_request' && (
        <TransformRequestPanel
          command={itemPanel}
          sessionId={id}
          participants={session.participants}
          onClose={() => setItemPanel(null)}
          onSend={sendText}
        />
      )}
      {itemPanel?.command_type === 'free_text' && <FreeActionPanel onClose={() => setItemPanel(null)} onSend={sendText} />}
      {itemPanel?.command_type === 'craft' && (
        <CraftPanel
          command={itemPanel}
          playthroughId={session.playthrough_id}
          onClose={() => setItemPanel(null)}
          onCraft={sendCraft}
        />
      )}

      <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 4, marginBottom: 4, flexShrink: 0, overflowX: 'auto' }}>
        <button
          type="button"
          style={{ ...COMMAND_ICON_STYLE, fontSize: 11, padding: '2px 6px', color: '#15803d', flexShrink: 0 }}
          title="周辺を調査・確認する（アドベンチャー的な行動用）"
          onClick={() => insertMention('周辺')}
        >
          @周辺
        </button>
        {session.participants.map((p) => (
          <button
            key={p.id}
            type="button"
            style={{ ...COMMAND_ICON_STYLE, fontSize: 11, padding: '2px 6px', color: '#2563eb', flexShrink: 0 }}
            onClick={() => insertMention(p.name)}
          >
            @{p.name}
          </button>
        ))}
      </div>

      <ActionCommandBar
        worldId={playthrough.world_id}
        participants={session.participants}
        mentionedParticipant={firstMentionedParticipant(draft, session.participants)}
        roomTemplateId={session.room_template_id}
        onKeywordSend={sendKeywordCommand}
        onOpenPanel={setItemPanel}
      />

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <input
          style={{ flex: 1 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="メッセージを入力（空欄のまま送信で続きを生成）"
        />
        <button onClick={handleSend}>送信</button>
      </div>
    </div>
  );
}
