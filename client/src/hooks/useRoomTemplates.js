import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { roomTemplatesApi } from '../api/roomTemplates.js';

export function useRoomTemplates() {
  return useQuery({ queryKey: ['roomTemplates'], queryFn: roomTemplatesApi.list });
}

export function useRoomTemplate(id) {
  return useQuery({
    queryKey: ['roomTemplates', id],
    queryFn: () => roomTemplatesApi.get(id),
    enabled: id != null,
  });
}

export function useRoomTemplateMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['roomTemplates'] });
  return {
    create: useMutation({ mutationFn: roomTemplatesApi.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, data }) => roomTemplatesApi.update(id, data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: roomTemplatesApi.remove, onSuccess: invalidate }),
    uploadBackgroundImage: useMutation({
      mutationFn: ({ id, file }) => roomTemplatesApi.uploadBackgroundImage(id, file),
      onSuccess: invalidate,
    }),
  };
}
