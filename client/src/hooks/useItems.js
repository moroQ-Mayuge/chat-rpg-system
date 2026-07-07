import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { itemsApi } from '../api/items.js';

export function useItemsForWorld(worldId) {
  return useQuery({ queryKey: ['items', worldId], queryFn: () => itemsApi.listForWorld(worldId), enabled: worldId != null });
}

export function useAllItems() {
  return useQuery({ queryKey: ['items', 'all'], queryFn: itemsApi.listAll });
}

export function useItemMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['items'] });
  return {
    create: useMutation({ mutationFn: itemsApi.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, data }) => itemsApi.update(id, data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: itemsApi.remove, onSuccess: invalidate }),
  };
}
