import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useRoomSession, useRoomSessionMutations } from '../hooks/useRoomSession.js';
import { useChatStream } from '../hooks/useChatStream.js';
import { playthroughsApi } from '../api/playthroughs.js';

export default function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, isLoading } = useRoomSession(id);
  const { sendMessage, exit } = useRoomSessionMutations(id);
  const [draft, setDraft] = useState('');
  const [scenePanelOpen, setScenePanelOpen] = useState(true);

  const { streamingText, isGenerating, error: streamError, sceneChangeNotice } = useChatStream(id, () => {
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

  async function handleExit() {
    await exit.mutateAsync();
    navigate(`/playthroughs/${session.playthrough_id}/pick-room`);
  }

  if (isLoading || !session || !playthrough) return <p>読み込み中...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          {playthrough.name} ／ {playthrough.current_day}日目 {playthrough.current_time_slot_label} ／{' '}
          {playthrough.current_weather} ／ {session.current_location_text}
        </p>
        <button onClick={handleExit}>部屋を退出する</button>
      </div>

      <p style={{ fontSize: 11, color: '#888' }}>
        参加キャラ: {session.participants.map((p) => p.name).join('、') || 'なし'}
      </p>

      <div style={{ marginBottom: 8 }}>
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

      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8, height: 340, overflowY: 'auto', marginBottom: 8 }}>
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
              <div style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 6 }}>
                {!isUser && (
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
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
            <span
              style={{
                display: 'inline-block',
                padding: '6px 10px',
                borderRadius: 8,
                background: '#dbeafe',
                fontSize: 13,
              }}
            >
              {streamingText || '…'}
            </span>
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

      <div style={{ display: 'flex', gap: 6 }}>
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
