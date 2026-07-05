import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { propsApi } from '../api/props.js';

export function useProps() {
  return useQuery({ queryKey: ['props'], queryFn: propsApi.list });
}

export function usePropMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['props'] });
  return {
    create: useMutation({ mutationFn: propsApi.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, data }) => propsApi.update(id, data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: propsApi.remove, onSuccess: invalidate }),
  };
}
