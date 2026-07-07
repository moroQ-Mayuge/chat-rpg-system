import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useRoomSession, useRoomSessionMutations } from '../hooks/useRoomSession.js';
import { useChatStream } from '../hooks/useChatStream.js';
import { playthroughsApi } from '../api/playthroughs.js';
import { useActionCommandsForWorld } from '../hooks/useActionCommands.js';
import { useItemsForWorld } from '../hooks/useItems.js';
import { useInventory, useInventoryMutations } from '../hooks/usePlaythroughs.js';

const COMMAND_ICON_STYLE = {
  fontSize: 12,
  padding: '4px 8px',
  borderRadius: 14,
  border: '1px solid #ddd',
  background: '#fff',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

// Icon-based quick actions above the chat input (chat enhancement backlog
// item 3): 'keyword' commands submit their fixed text as if typed (an easy
// way to fire keyword-condition events without free-typing exact phrasing);
// the item_* types open a small inline panel instead of sending immediately.
function ActionCommandBar({ worldId, onKeywordSend, onOpenPanel }) {
  const { data: commands } = useActionCommandsForWorld(worldId);
  if (!commands || commands.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6, flexShrink: 0 }}>
      {commands.map((cmd) => (
        <button
          key={cmd.id}
          type="button"
          style={COMMAND_ICON_STYLE}
          onClick={() => (cmd.command_type === 'keyword' ? onKeywordSend(cmd.keyword_text) : onOpenPanel(cmd.command_type))}
        >
          {cmd.icon} {cmd.label}
        </button>
      ))}
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

function ItemUsePanel({ playthroughId, participants, onClose, onUse }) {
  const { data: inventory } = useInventory(playthroughId);
  const [itemId, setItemId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [description, setDescription] = useState('');

  function submit() {
    const entry = inventory?.find((e) => e.item_id === Number(itemId));
    if (!entry) return;
    const target = participants.find((p) => p.character_id === Number(targetId));
    const targetText = target ? `@${target.name}に` : '';
    const text = `『${entry.name}』を${targetText}使う${description ? `：${description}` : ''}`;
    onUse(text);
    onClose();
  }

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8, marginBottom: 6, flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>アイテムを使う</span>
        <button type="button" onClick={onClose} style={{ fontSize: 11 }}>
          閉じる
        </button>
      </div>
      {inventory?.length === 0 && <p style={{ fontSize: 12, color: '#888' }}>使えるアイテムを持っていません</p>}
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
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>対象（任意）</span>
            <select style={{ width: '100%' }} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">指定なし</option>
              {participants.map((p) => (
                <option key={p.character_id} value={p.character_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>使い方（任意）</span>
            <input style={{ width: '100%' }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="どのように使うか" />
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={submit} disabled={!itemId}>
              使う
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
  const { sendMessage, exit } = useRoomSessionMutations(id);
  const [draft, setDraft] = useState('');
  const [scenePanelOpen, setScenePanelOpen] = useState(true);
  const [itemPanel, setItemPanel] = useState(null);

  const { isGenerating, error: streamError, sceneChangeNotice } = useChatStream(id, () => {
    queryClient.invalidateQueries({ queryKey: ['roomSessions', id] });
  });

  function participantFor(characterId) {
    return session?.participants.find((p) => p.character_id === characterId);
  }

  function expressionImageFor(characterId, emotionTag) {
    const participant = participantFor(characterId);
    return participant?.expression_images.find((img) => img.llm_tag_key === emotionTag)?.image_path ?? null;
  }

  const { data: playthrough } = useQuery({
    queryKey: ['playthroughs', session?.playthrough_id],
    queryFn: () => playthroughsApi.get(session.playthrough_id),
    enabled: session != null,
  });

  async function handleSend() {
    if (!draft.trim()) return;
    await sendMessage.mutateAsync(draft.trim());
    setDraft('');
  }

  async function sendText(text) {
    await sendMessage.mutateAsync(text);
  }

  function insertMention(name) {
    setDraft((d) => (d ? `${d} @${name} ` : `@${name} `));
  }

  async function handleExit() {
    await exit.mutateAsync();
    navigate(`/playthroughs/${session.playthrough_id}/pick-room`);
  }

  if (isLoading || !session || !playthrough) return <p>読み込み中...</p>;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0.75rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexShrink: 0 }}>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          {playthrough.name} ／ {playthrough.current_day}日目 {playthrough.current_time_slot_label} ／{' '}
          {playthrough.current_weather} ／ {session.current_location_text}
        </p>
        <button onClick={handleExit}>部屋を退出する</button>
      </div>

      <p style={{ fontSize: 11, color: '#888', flexShrink: 0, margin: '0 0 4px' }}>
        参加キャラ: {session.participants.map((p) => p.name).join('、') || 'なし'}
      </p>

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
        {streamError && <p style={{ color: 'red', fontSize: 12 }}>エラー: {streamError}</p>}
      </div>

      {itemPanel === 'item_check' && <ItemCheckPanel playthroughId={session.playthrough_id} onClose={() => setItemPanel(null)} />}
      {itemPanel === 'item_pickup' && (
        <ItemPickupPanel
          worldId={playthrough.world_id}
          playthroughId={session.playthrough_id}
          onClose={() => setItemPanel(null)}
          onAcquired={sendText}
        />
      )}
      {itemPanel === 'item_use' && (
        <ItemUsePanel
          playthroughId={session.playthrough_id}
          participants={session.participants}
          onClose={() => setItemPanel(null)}
          onUse={sendText}
        />
      )}
      {itemPanel === 'free_text' && <FreeActionPanel onClose={() => setItemPanel(null)} onSend={sendText} />}

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

      <ActionCommandBar worldId={playthrough.world_id} onKeywordSend={sendText} onOpenPanel={setItemPanel} />

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <input
          style={{ flex: 1 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="メッセージを入力"
        />
        <button onClick={handleSend}>送信</button>
      </div>
    </div>
  );
}
