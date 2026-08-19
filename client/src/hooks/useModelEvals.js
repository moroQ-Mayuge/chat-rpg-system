import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { modelEvalsApi } from '../api/modelEvals.js';

export function useEvalCriteria() {
  return useQuery({ queryKey: ['modelEvalCriteria'], queryFn: modelEvalsApi.listCriteria, staleTime: 300000 });
}

export function useEvalScenarios() {
  return useQuery({ queryKey: ['modelEvalScenarios'], queryFn: modelEvalsApi.listScenarios });
}

export function useEvalScenarioMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['modelEvalScenarios'] });
  return {
    create: useMutation({ mutationFn: modelEvalsApi.createScenario, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, data }) => modelEvalsApi.updateScenario(id, data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: modelEvalsApi.removeScenario, onSuccess: invalidate }),
  };
}

export function useEvalRuns() {
  return useQuery({ queryKey: ['modelEvalRuns'], queryFn: modelEvalsApi.listRuns });
}

// 実行中だけ2秒間隔でポーリングする。評価は部屋セッションに紐づかないため
// チャット用のWebSocketが使えず、既存の非チャット系UIと同じポーリング方式。
export function useEvalRun(id) {
  return useQuery({
    queryKey: ['modelEvalRun', id],
    queryFn: () => modelEvalsApi.getRun(id),
    enabled: id != null,
    refetchInterval: (query) => (query.state.data?.run?.status === 'running' ? 2000 : false),
  });
}

export function useEvalResults(id) {
  return useQuery({
    queryKey: ['modelEvalResults', id],
    queryFn: () => modelEvalsApi.listResults(id),
    enabled: id != null,
  });
}

export function useEvalRunMutations() {
  const queryClient = useQueryClient();
  return {
    start: useMutation({
      mutationFn: modelEvalsApi.startRun,
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['modelEvalRuns'] }),
    }),
    cancel: useMutation({
      mutationFn: modelEvalsApi.cancelRun,
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['modelEvalRuns'] }),
    }),
    setManualScore: useMutation({
      mutationFn: ({ resultId, data }) => modelEvalsApi.setManualScore(resultId, data),
      onSuccess: (_, { runId }) => queryClient.invalidateQueries({ queryKey: ['modelEvalResults', runId] }),
    }),
  };
}
