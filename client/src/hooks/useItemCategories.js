import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { itemCategoriesApi } from '../api/itemCategories.js';

export function useItemCategoriesForWorld(worldId) {
  return useQuery({
    queryKey: ['itemCategories', worldId],
    queryFn: () => itemCategoriesApi.listForWorld(worldId),
    enabled: worldId != null,
  });
}

export function useAllItemCategories() {
  return useQuery({ queryKey: ['itemCategories', 'all'], queryFn: itemCategoriesApi.listAll });
}

export function useItemCategoryMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['itemCategories'] });
  return {
    create: useMutation({ mutationFn: itemCategoriesApi.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, data }) => itemCategoriesApi.update(id, data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: itemCategoriesApi.remove, onSuccess: invalidate }),
  };
}
