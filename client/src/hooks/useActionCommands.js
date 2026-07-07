import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { actionCommandsApi } from '../api/actionCommands.js';

export function useActionCommandsForWorld(worldId) {
  return useQuery({
    queryKey: ['actionCommands', worldId],
    queryFn: () => actionCommandsApi.listForWorld(worldId),
    enabled: worldId != null,
  });
}

export function useAllActionCommands() {
  return useQuery({ queryKey: ['actionCommands', 'all'], queryFn: actionCommandsApi.listAll });
}

export function useActionCommandMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['actionCommands'] });
  return {
    create: useMutation({ mutationFn: actionCommandsApi.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, data }) => actionCommandsApi.update(id, data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: actionCommandsApi.remove, onSuccess: invalidate }),
  };
}
