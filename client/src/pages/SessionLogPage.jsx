import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useRoomSession } from '../hooks/useRoomSession.js';

// Read-only viewer for a past (or active) room_session's message history —
// the "log" half of the Room→Place design: sessions still end and reset on
// each move, but nothing about them becomes unreachable afterward.
//
// ?day= (0122): セッション境界モードの「切らない」等で1つのセッションが
// 複数のログ日にまたがる場合、その日のログだけを表示する。省略時は
// session.log_day(当日/最新)にフォールバックする(useRoomSessionのday指定)。
export default function SessionLogPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const dayParam = searchParams.get('day');
  const { data: session, isLoading } = useRoomSession(id, { day: dayParam != null ? Number(dayParam) : 'current' });

  // all_participants includes departed characters (unlike session.participants,
  // which is active-only) so past messages from someone who since left still
  // resolve a name/expression image instead of "???".
  function participantFor(characterId) {
    return session?.all_participants.find((p) => p.character_id === characterId);
  }

  function expressionImageFor(characterId, emotionTag) {
    const participant = participantFor(characterId);
    return participant?.expression_images.find((img) => img.llm_tag_key === emotionTag)?.image_path ?? null;
  }

  if (isLoading || !session) return <p>読み込み中...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          {session.current_location_text} ／ {session.view_day ?? session.entered_day}日目 ／{' '}
          {session.status === 'active' ? '進行中' : '終了済み'}（閲覧専用）
        </p>
        <Link to={`/playthroughs/${session.playthrough_id}/history`}>
          <button>履歴一覧へ戻る</button>
        </Link>
      </div>

      {(session.log_days?.length ?? 0) > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {session.log_days.map((day) => (
            <Link
              key={day}
              to={`/room-sessions/${id}/log?day=${day}`}
              style={{
                fontSize: 12,
                padding: '2px 8px',
                borderRadius: 6,
                border: '1px solid #ddd',
                textDecoration: 'none',
                color: day === (session.view_day ?? session.entered_day) ? '#fff' : '#333',
                background: day === (session.view_day ?? session.entered_day) ? '#2563eb' : '#fff',
              }}
            >
              {day}日目
            </Link>
          ))}
        </div>
      )}

      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8 }}>
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
                  {participant?.display_name ?? '???'} {m.emotion_tag && `[${m.emotion_tag}]`}
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
        {session.messages.length === 0 && <p style={{ color: '#999', fontSize: 12 }}>まだメッセージがありません</p>}
      </div>
    </div>
  );
}
