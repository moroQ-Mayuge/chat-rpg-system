import { WebSocketServer } from 'ws';
import { joinRoom, leaveRoom } from './rooms.js';

export function attachSocketServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const roomSessionId = url.searchParams.get('roomSessionId');
    if (!roomSessionId) {
      ws.close();
      return;
    }
    joinRoom(roomSessionId, ws);
    ws.on('close', () => leaveRoom(roomSessionId, ws));
  });

  return wss;
}
