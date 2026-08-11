import { api } from './client.js';

export const outfitsApi = {
  create: (characterId, data) => api.post(`/characters/${characterId}/outfits`, data),
  createFromMaster: (characterId, data) => api.post(`/characters/${characterId}/outfits/from-master`, data),
  overwriteFromMaster: (id, data) => api.post(`/outfits/${id}/overwrite-from-master`, data),
  detachMaster: (id) => api.post(`/outfits/${id}/detach-master`),
  promoteToMaster: (id, data) => api.post(`/outfits/${id}/promote-to-master`, data),
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
  generateStandingImage: (id, extraHint, tags) =>
    api.post(`/outfits/${id}/generate-standing-image`, { extra_hint: extraHint, ...tags }),
  generateExpressionImage: (id, expressionTypeId, extraHint, mode, tags) =>
    api.post(`/outfits/${id}/generate-expression-image/${expressionTypeId}`, { extra_hint: extraHint, mode, ...tags }),
};
