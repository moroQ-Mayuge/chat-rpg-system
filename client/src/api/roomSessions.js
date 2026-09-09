import { api } from './client.js';

export const roomSessionsApi = {
  // day: 'current'(セッションの当日分のみ、0122) | 数値(その日のログのみ) | 省略(全件)
  get: (id, { day } = {}) => api.get(`/room-sessions/${id}${day != null ? `?day=${day}` : ''}`),
  sendMessage: (id, content) => api.post(`/room-sessions/${id}/messages`, { content }),
  craftItem: (id, content, craft) => api.post(`/room-sessions/${id}/messages`, { content, craft }),
  exit: (id) => api.post(`/room-sessions/${id}/exit`, {}),
  move: (id, connectionId) => api.post(`/room-sessions/${id}/move`, { connection_id: connectionId }),
  setAccompanying: (id, characterId, isAccompanying, roomSessionCharacterId) =>
    api.post(`/room-sessions/${id}/participants/${characterId}/accompanying`, {
      is_accompanying: isAccompanying,
      room_session_character_id: roomSessionCharacterId ?? null,
    }),
  sellItem: (id, itemId) => api.post(`/room-sessions/${id}/sell-item`, { item_id: itemId }),
  getShopProducts: (id) => api.get(`/room-sessions/${id}/shop-products`),
  buyItem: (id, itemId) => api.post(`/room-sessions/${id}/buy-item`, { item_id: itemId }),
  buyOutfit: (id, outfitMasterId) => api.post(`/room-sessions/${id}/buy-outfit`, { outfit_master_id: outfitMasterId }),
  listPickupableOutfits: (id) => api.get(`/room-sessions/${id}/pickupable-outfits`),
  pickupOutfit: (id, outfitMasterId) => api.post(`/room-sessions/${id}/pickup-outfit`, { outfit_master_id: outfitMasterId }),
  wearItem: (id, characterId, itemId) => api.post(`/room-sessions/${id}/wear-item`, { character_id: characterId, item_id: itemId }),
  wearOutfit: (id, characterId, outfitMasterId) =>
    api.post(`/room-sessions/${id}/wear-outfit`, { character_id: characterId, outfit_master_id: outfitMasterId }),
  transformRequest: (id, characterId, transformationId) =>
    api.post(`/room-sessions/${id}/transform-request`, { character_id: characterId, transformation_id: transformationId }),
  listPickupItems: (id) => api.get(`/room-sessions/${id}/pickup-items`),
  pickUpItem: (id, itemId) => api.post(`/room-sessions/${id}/pickup`, { item_id: itemId }),
};
