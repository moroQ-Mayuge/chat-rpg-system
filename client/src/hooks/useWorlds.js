import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { worldsApi } from '../api/worlds.js';

export function useWorlds() {
  return useQuery({ queryKey: ['worlds'], queryFn: worldsApi.list });
}

export function useWorldMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['worlds'] });
  return {
    create: useMutation({ mutationFn: worldsApi.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, data }) => worldsApi.update(id, data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: worldsApi.remove, onSuccess: invalidate }),
  };
}
