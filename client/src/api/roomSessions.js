import { api } from './client.js';

export const roomSessionsApi = {
  get: (id) => api.get(`/room-sessions/${id}`),
  sendMessage: (id, content) => api.post(`/room-sessions/${id}/messages`, { content }),
  exit: (id) => api.post(`/room-sessions/${id}/exit`, {}),
};
