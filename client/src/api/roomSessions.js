import { api } from './client.js';

export const roomSessionsApi = {
  get: (id) => api.get(`/room-sessions/${id}`),
  sendMessage: (id, content) => api.post(`/room-sessions/${id}/messages`, { content }),
  exit: (id) => api.post(`/room-sessions/${id}/exit`, {}),
  move: (id, connectionId) => api.post(`/room-sessions/${id}/move`, { connection_id: connectionId }),
  setAccompanying: (id, characterId, isAccompanying) =>
    api.post(`/room-sessions/${id}/participants/${characterId}/accompanying`, { is_accompanying: isAccompanying }),
  sellItem: (id, itemId) => api.post(`/room-sessions/${id}/sell-item`, { item_id: itemId }),
  wearItem: (id, characterId, itemId) => api.post(`/room-sessions/${id}/wear-item`, { character_id: characterId, item_id: itemId }),
  wearOutfit: (id, characterId, outfitMasterId) =>
    api.post(`/room-sessions/${id}/wear-outfit`, { character_id: characterId, outfit_master_id: outfitMasterId }),
  transformRequest: (id, characterId, transformationId) =>
    api.post(`/room-sessions/${id}/transform-request`, { character_id: characterId, transformation_id: transformationId }),
  listPickupItems: (id) => api.get(`/room-sessions/${id}/pickup-items`),
  pickUpItem: (id, itemId) => api.post(`/room-sessions/${id}/pickup`, { item_id: itemId }),
};
