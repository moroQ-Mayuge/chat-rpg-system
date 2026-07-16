import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useRoomSession, useRoomSessionMutations } from '../hooks/useRoomSession.js';
import { useRoomConnections } from '../hooks/useRoomTemplates.js';
import { useChatStream } from '../hooks/useChatStream.js';
import { playthroughsApi } from '../api/playthroughs.js';
import { useActionCommandsForWorld } from '../hooks/useActionCommands.js';
import { useItemsForWorld } from '../hooks/useItems.js';
import { useInventory, useInventoryMutations } from '../hooks/usePlaythroughs.js';

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

function commandVisible(cmd, activeIds) {
  const required = (cmd.visible_when_status_ids ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  if (required.length === 0) return true;
  return required.some((id) => activeIds.has(id));
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
function ActionCommandBar({ worldId, participants, onKeywordSend, onOpenPanel }) {
  const { data: commands } = useActionCommandsForWorld(worldId);
  const [openCategory, setOpenCategory] = useState(null);
  const [openSubcategory, setOpenSubcategory] = useState(null);
  if (!commands || commands.length === 0) return null;

  const activeIds = activeStatusIdSet(participants);
  const visibleCommands = commands.filter((cmd) => commandVisible(cmd, activeIds));

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

function ItemCheckPanel({ playthroughId, onClose }) {
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
        <p key={entry.id} style={{ fontSize: 12, margin: '2px 0' }}>
          {entry.name} ×{entry.quantity}
          {entry.description && <span style={{ color: '#888' }}> — {entry.description}</span>}
        </p>
      ))}
    </div>
  );
}

function ItemPickupPanel({ worldId, playthroughId, onClose, onAcquired }) {
  const { data: items } = useItemsForWorld(worldId);
  const { addItem } = useInventoryMutations(playthroughId);

  async function pickUp(item) {
    await addItem.mutateAsync({ itemId: item.id, quantity: 1 });
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
        {items?.length === 0 && <p style={{ fontSize: 12, color: '#888' }}>このWorldにはアイテムが登録されていません</p>}
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
  const { useItem, transferItem } = useInventoryMutations(playthroughId);
  const [itemId, setItemId] = useState('');
  const [targetId, setTargetId] = useState(() => detectMentionedParticipant(draft, participants));
  const [description, setDescription] = useState('');

  async function submit() {
    const entry = inventory?.find((e) => e.item_id === Number(itemId));
    if (!entry) return;
    const target = participants.find((p) => p.character_id === Number(targetId));

    if (command.transfers_to_target) {
      if (!target) return;
      await transferItem.mutateAsync({ itemId: entry.item_id, quantity: 1, toCharacterId: target.character_id });
      onSend(`『${entry.name}』を@${target.name}に${command.label}`);
      onClose();
      return;
    }

    if (command.consumes_item) {
      await useItem.mutateAsync({ itemId: entry.item_id, quantity: 1 });
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
      {inventory?.length === 0 && <p style={{ fontSize: 12, color: '#888' }}>持ち物がありません</p>}
      {inventory?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>アイテム</span>
            <select style={{ width: '100%' }} value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">選択してください</option>
              {inventory.map((entry) => (
                <option key={entry.item_id} value={entry.item_id}>
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
                <option key={p.character_id} value={p.character_id}>
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
            <button type="button" onClick={submit} disabled={!itemId || (command.transfers_to_target && !targetId)}>
              {command.label}
            </button>
          </div>
        </div>
      )}
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
  const { sendMessage, exit, move, setAccompanying } = useRoomSessionMutations(id);
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
  const [scenePanelOpen, setScenePanelOpen] = useState(true);
  const [itemPanel, setItemPanel] = useState(null);

  const { isGenerating, error: streamError, sceneChangeNotice, relationshipNotice } = useChatStream(id, () => {
    queryClient.invalidateQueries({ queryKey: ['roomSessions', id] });
  });

  function participantFor(characterId) {
    return session?.participants.find((p) => p.character_id === characterId);
  }

  function expressionImageFor(characterId, emotionTag) {
    const participant = participantFor(characterId);
    return participant?.expression_images.find((img) => img.llm_tag_key === emotionTag)?.image_path ?? null;
  }

  // Submitting with an empty draft is not a no-op: it's an explicit "continue
  // from here" trigger (no user action/speech), handled server-side by
  // generating the next turn without inserting a user message at all.
  async function handleSend() {
    await sendMessage.mutateAsync(draft.trim());
    setDraft('');
  }

  async function sendText(text) {
    await sendMessage.mutateAsync(text);
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
    setDraft('');
  }

  function insertMention(name) {
    setDraft((d) => (d ? `${d} @${name} ` : `@${name} `));
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
        </p>
        {!session.room_is_place && <button onClick={handleExit}>部屋を退出する</button>}
      </div>

      {session.room_is_place && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6, flexShrink: 0 }}>
          {(connections ?? []).map((c) => (
            <button key={c.id} onClick={() => handleMove(c.id)} style={{ fontSize: 12 }}>
              → {c.to_room_name}
              {c.label && `（${c.label}）`} [消費{c.movement_cost}]
            </button>
          ))}
          {connections?.length === 0 && <span style={{ fontSize: 11, color: '#888' }}>移動先が設定されていません</span>}
        </div>
      )}

      <p style={{ fontSize: 11, color: '#888', flexShrink: 0, margin: '0 0 4px' }}>
        参加キャラ:{' '}
        {session.participants.length === 0
          ? 'なし'
          : session.participants.map((p) => (
              <span key={p.character_id} style={{ marginRight: 8 }}>
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

      {Object.values(session.status_display_visibility.panel).some(Boolean) && (
        <details style={{ marginBottom: 6, flexShrink: 0 }}>
          <summary style={{ fontSize: 11, color: '#888', cursor: 'pointer' }}>ステータスパネル</summary>
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {session.participants.map((p) => (
              <div key={p.character_id} style={{ fontSize: 11 }}>
                <strong>{p.name}</strong>
                <StatusInline status={p.status} visibility={session.status_display_visibility.panel} />
              </div>
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
        {streamError && <p style={{ color: 'red', fontSize: 12 }}>エラー: {streamError}</p>}
      </div>

      {itemPanel?.command_type === 'item_check' && (
        <ItemCheckPanel playthroughId={session.playthrough_id} onClose={() => setItemPanel(null)} />
      )}
      {itemPanel?.command_type === 'item_pickup' && (
        <ItemPickupPanel
          worldId={playthrough.world_id}
          playthroughId={session.playthrough_id}
          onClose={() => setItemPanel(null)}
          onAcquired={sendText}
        />
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
      {itemPanel?.command_type === 'free_text' && <FreeActionPanel onClose={() => setItemPanel(null)} onSend={sendText} />}

      {session.participants.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4, flexShrink: 0 }}>
          {session.participants.map((p) => (
            <button
              key={p.character_id}
              type="button"
              style={{ ...COMMAND_ICON_STYLE, fontSize: 11, padding: '2px 6px', color: '#2563eb' }}
              onClick={() => insertMention(p.name)}
            >
              @{p.name}
            </button>
          ))}
        </div>
      )}

      <ActionCommandBar
        worldId={playthrough.world_id}
        participants={session.participants}
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
