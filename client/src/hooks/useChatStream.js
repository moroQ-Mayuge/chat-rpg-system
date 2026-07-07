import { useEffect, useRef, useState } from 'react';

// A single generation turn can produce several messages (one per character
// plus narration, SPEC.md 3.8). The server now parses+persists+broadcasts
// each one as soon as it completes during streaming (rather than waiting for
// the whole response), so every message_complete event triggers a refetch
// and chat bubbles reveal one at a time as they arrive.
export function useChatStream(sessionId, onGenerationDone) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [sceneChangeNotice, setSceneChangeNotice] = useState(null);
  const onDoneRef = useRef(onGenerationDone);
  onDoneRef.current = onGenerationDone;

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
        setSceneChangeNotice(data.description);
      } else if (data.type === 'generation_done') {
        setIsGenerating(false);
        onDoneRef.current?.();
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

    return () => ws.close();
  }, [sessionId]);

  return { isGenerating, error, sceneChangeNotice };
}
