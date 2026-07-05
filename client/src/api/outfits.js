import { api } from './client.js';

export const outfitsApi = {
  create: (characterId, data) => api.post(`/characters/${characterId}/outfits`, data),
  update: (id, data) => api.put(`/outfits/${id}`, data),
  remove: (id) => api.del(`/outfits/${id}`),
  uploadStandingImage: (id, file) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post(`/outfits/${id}/standing-image`, formData);
  },
  uploadExpressionImage: (id, expressionTypeId, file) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post(`/outfits/${id}/expression-image/${expressionTypeId}`, formData);
  },
  generateStandingImage: (id, extraHint) => api.post(`/outfits/${id}/generate-standing-image`, { extra_hint: extraHint }),
  generateExpressionImage: (id, expressionTypeId, extraHint) =>
    api.post(`/outfits/${id}/generate-expression-image/${expressionTypeId}`, { extra_hint: extraHint }),
};
