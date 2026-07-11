import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { characterStatusesApi } from '../api/characterStatuses.js';

export function useCharacterStatusesForWorld(worldId) {
  return useQuery({
    queryKey: ['characterStatuses', worldId],
    queryFn: () => characterStatusesApi.listForWorld(worldId),
    enabled: worldId != null,
  });
}

export function useAllCharacterStatuses() {
  return useQuery({ queryKey: ['characterStatuses', 'all'], queryFn: characterStatusesApi.listAll });
}

export function useCharacterStatusMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['characterStatuses'] });
  return {
    create: useMutation({ mutationFn: characterStatusesApi.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, data }) => characterStatusesApi.update(id, data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: characterStatusesApi.remove, onSuccess: invalidate }),
  };
}
