import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { roomSessionsApi } from '../api/roomSessions.js';

export function useRoomSession(id) {
  return useQuery({
    queryKey: ['roomSessions', id],
    queryFn: () => roomSessionsApi.get(id),
    enabled: id != null,
  });
}

export function useRoomSessionMutations(id) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['roomSessions', id] });
    // A message can trigger the room template's turn-count time-advance trigger,
    // which mutates the playthrough's calendar state, so keep its query fresh too.
    queryClient.invalidateQueries({ queryKey: ['playthroughs'] });
  };
  return {
    sendMessage: useMutation({ mutationFn: (content) => roomSessionsApi.sendMessage(id, content), onSuccess: invalidate }),
    exit: useMutation({ mutationFn: () => roomSessionsApi.exit(id), onSuccess: invalidate }),
  };
}
