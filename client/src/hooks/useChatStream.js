import { useEffect, useRef, useState } from 'react';

// A single generation turn can produce several messages (one per character
// plus narration, SPEC.md 3.8). The server now parses+persists+broadcasts
// each one as soon as it completes during streaming (rather than waiting for
// the whole response), so every message_complete event triggers a refetch
// and chat bubbles reveal one at a time as they arrive.
const NOTICE_DURATION_MS = 6000;

export function useChatStream(sessionId, onGenerationDone, onForcedTransfer) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [sceneChangeNotice, setSceneChangeNotice] = useState(null);
  const [relationshipNotice, setRelationshipNotice] = useState(null);
  const [refusalNotice, setRefusalNotice] = useState(null);
  const onDoneRef = useRef(onGenerationDone);
  onDoneRef.current = onGenerationDone;
  const onTransferRef = useRef(onForcedTransfer);
  onTransferRef.current = onForcedTransfer;
  const sceneChangeTimerRef = useRef(null);
  const relationshipTimerRef = useRef(null);
  const refusalTimerRef = useRef(null);

  // Both notices previously persisted forever once set (known gap) — each
  // now clears itself after NOTICE_DURATION_MS, restarting the timer if a
  // new notice of the same kind arrives first.
  function showNotice(setter, timerRef, text) {
    clearTimeout(timerRef.current);
    setter(text);
    timerRef.current = setTimeout(() => setter(null), NOTICE_DURATION_MS);
  }

  useEffect(() => {
    if (sessionId == null) return undefined;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws?roomSessionId=${sessionId}`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'generation_start') {
        setIsGenerating(true);
        setError(null);
      } else if (data.type === 'scene_change_detected') {
        showNotice(setSceneChangeNotice, sceneChangeTimerRef, data.description);
      } else if (data.type === 'relationship_changed') {
        showNotice(setRelationshipNotice, relationshipTimerRef, data.description);
      } else if (data.type === 'generation_refused') {
        showNotice(setRefusalNotice, refusalTimerRef, '応答なし（LLMが応答を生成できませんでした）');
      } else if (data.type === 'generation_done') {
        setIsGenerating(false);
        onDoneRef.current?.();
      } else if (data.type === 'forced_room_transfer') {
        // セッション境界モード(0122)により、サーバー側がこのセッションを畳んで
        // 新しいセッションを開き直した(時間帯/日の切れ目・イベントのend_session等)。
        // 手を打たないとクライアントは終了済みセッションのwsに繋がったまま留まる
        // ——0121で見つかった既知バグの修正。
        setIsGenerating(false);
        onTransferRef.current?.(data.new_session_id);
      } else if (data.type === 'message_complete') {
        // Each unit (character line, narration, scene image) arrives via its
        // own event as soon as it's ready, so refetch per-event rather than
        // waiting for generation_done.
        onDoneRef.current?.();
      } else if (data.type === 'error') {
        setIsGenerating(false);
        setError(data.message);
      }
    };

    return () => {
      ws.close();
      clearTimeout(sceneChangeTimerRef.current);
      clearTimeout(relationshipTimerRef.current);
      clearTimeout(refusalTimerRef.current);
    };
  }, [sessionId]);

  return { isGenerating, error, sceneChangeNotice, relationshipNotice, refusalNotice };
}
