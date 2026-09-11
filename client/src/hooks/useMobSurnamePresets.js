import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mobSurnamePresetsApi } from '../api/mobSurnamePresets.js';

export function useMobSurnamePresetsForWorld(worldId) {
  return useQuery({
    queryKey: ['mobSurnamePresets', worldId],
    queryFn: () => mobSurnamePresetsApi.listForWorld(worldId),
    enabled: worldId != null,
  });
}

export function useMobSurnamePresetMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['mobSurnamePresets'] });
  return {
    create: useMutation({ mutationFn: mobSurnamePresetsApi.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, data }) => mobSurnamePresetsApi.update(id, data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: mobSurnamePresetsApi.remove, onSuccess: invalidate }),
  };
}
