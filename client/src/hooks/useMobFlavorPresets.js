import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mobFlavorPresetsApi } from '../api/mobFlavorPresets.js';

export function useMobFlavorPresetsForWorld(worldId) {
  return useQuery({
    queryKey: ['mobFlavorPresets', worldId],
    queryFn: () => mobFlavorPresetsApi.listForWorld(worldId),
    enabled: worldId != null,
  });
}

export function useMobFlavorPresetMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['mobFlavorPresets'] });
  return {
    create: useMutation({ mutationFn: mobFlavorPresetsApi.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, data }) => mobFlavorPresetsApi.update(id, data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: mobFlavorPresetsApi.remove, onSuccess: invalidate }),
  };
}
