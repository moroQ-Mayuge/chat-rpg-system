import { api } from './client.js';

export const modelEvalsApi = {
  listCriteria: () => api.get('/model-evals/criteria'),
  listScenarios: () => api.get('/model-evals/scenarios'),
  createScenario: (data) => api.post('/model-evals/scenarios', data),
  updateScenario: (id, data) => api.put(`/model-evals/scenarios/${id}`, data),
  removeScenario: (id) => api.del(`/model-evals/scenarios/${id}`),
  listRuns: () => api.get('/model-evals/runs'),
  startRun: (data) => api.post('/model-evals/runs', data),
  getRun: (id) => api.get(`/model-evals/runs/${id}`),
  listResults: (id) => api.get(`/model-evals/runs/${id}/results`),
  cancelRun: (id) => api.post(`/model-evals/runs/${id}/cancel`, {}),
  setManualScore: (resultId, data) => api.put(`/model-evals/results/${resultId}/manual`, data),
};
