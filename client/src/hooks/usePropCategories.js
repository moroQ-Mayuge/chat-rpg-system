import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { propCategoriesApi } from '../api/propCategories.js';

export function usePropCategoriesForWorld(worldId) {
  return useQuery({
    queryKey: ['propCategories', worldId],
    queryFn: () => propCategoriesApi.listForWorld(worldId),
    enabled: worldId != null,
  });
}

export function useAllPropCategories() {
  return useQuery({ queryKey: ['propCategories', 'all'], queryFn: propCategoriesApi.listAll });
}

export function usePropCategoryMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['propCategories'] });
  return {
    create: useMutation({ mutationFn: propCategoriesApi.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, data }) => propCategoriesApi.update(id, data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: propCategoriesApi.remove, onSuccess: invalidate }),
  };
}
