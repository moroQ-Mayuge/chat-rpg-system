import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mobNamePresetsApi } from '../api/mobNamePresets.js';

export function useMobNamePresetsForWorld(worldId) {
  return useQuery({
    queryKey: ['mobNamePresets', worldId],
    queryFn: () => mobNamePresetsApi.listForWorld(worldId),
    enabled: worldId != null,
  });
}

export function useMobNamePresetMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['mobNamePresets'] });
  return {
    create: useMutation({ mutationFn: mobNamePresetsApi.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, data }) => mobNamePresetsApi.update(id, data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: mobNamePresetsApi.remove, onSuccess: invalidate }),
  };
}
