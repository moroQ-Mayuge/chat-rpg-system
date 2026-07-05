// Map<roomSessionId, Set<WebSocket>>. A socket belongs to exactly one room at a
// time, matching actual UI usage (one active chat session per browser tab).
const rooms = new Map();

export function joinRoom(roomSessionId, ws) {
  if (!rooms.has(roomSessionId)) rooms.set(roomSessionId, new Set());
  rooms.get(roomSessionId).add(ws);
}

export function leaveRoom(roomSessionId, ws) {
  rooms.get(roomSessionId)?.delete(ws);
  if (rooms.get(roomSessionId)?.size === 0) rooms.delete(roomSessionId);
}

export function broadcast(roomSessionId, event) {
  const sockets = rooms.get(roomSessionId);
  if (!sockets) return;
  const payload = JSON.stringify(event);
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}
