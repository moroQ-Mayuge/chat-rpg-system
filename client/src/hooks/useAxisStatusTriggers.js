import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { axisStatusTriggersApi } from '../api/axisStatusTriggers.js';

export function useAxisStatusTriggers() {
  return useQuery({ queryKey: ['axisStatusTriggers'], queryFn: axisStatusTriggersApi.listAll });
}

export function useAxisStatusTriggerMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['axisStatusTriggers'] });
  return {
    create: useMutation({ mutationFn: axisStatusTriggersApi.create, onSuccess: invalidate }),
    remove: useMutation({ mutationFn: axisStatusTriggersApi.remove, onSuccess: invalidate }),
  };
}
