import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../api/settings.js';

export function useSettingsStatus() {
  return useQuery({
    queryKey: ['settings', 'status'],
    queryFn: settingsApi.status,
    refetchInterval: 15000,
  });
}

export function useStylePresets() {
  return useQuery({ queryKey: ['stylePresets'], queryFn: settingsApi.listStylePresets });
}

export function useStylePresetMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['stylePresets'] });
  return {
    create: useMutation({ mutationFn: settingsApi.createStylePreset, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, data }) => settingsApi.updateStylePreset(id, data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: settingsApi.removeStylePreset, onSuccess: invalidate }),
  };
}

export function useImageFormats() {
  return useQuery({ queryKey: ['imageFormats'], queryFn: settingsApi.listImageFormats });
}

export function useImageFormatMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['imageFormats'] });
  return {
    set: useMutation({ mutationFn: ({ kind, format }) => settingsApi.setImageFormat(kind, format), onSuccess: invalidate }),
  };
}

export function useSamplers() {
  return useQuery({ queryKey: ['samplers'], queryFn: settingsApi.listSamplers, staleTime: 60000 });
}

export function useImageGenerationSettings() {
  return useQuery({ queryKey: ['imageGenerationSettings'], queryFn: settingsApi.listImageGenerationSettings });
}

export function useKoboldcppLaunchSettings() {
  return useQuery({ queryKey: ['koboldcppLaunchSettings'], queryFn: settingsApi.getKoboldcppLaunchSettings });
}

export function useKoboldcppLaunchSettingsMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['koboldcppLaunchSettings'] });
  return {
    update: useMutation({ mutationFn: settingsApi.updateKoboldcppLaunchSettings, onSuccess: invalidate }),
  };
}

export function useImageGenerationSettingsMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['imageGenerationSettings'] });
  return {
    update: useMutation({
      mutationFn: ({ kind, data }) => settingsApi.updateImageGenerationSettings(kind, data),
      onSuccess: invalidate,
    }),
  };
}

export function useStatusDisplayPreferences() {
  return useQuery({ queryKey: ['statusDisplayPreferences'], queryFn: settingsApi.getStatusDisplayPreferences });
}

export function useStatusDisplayPreferencesMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['statusDisplayPreferences'] });
  // Invalidate roomSessions too, since getRoomSession computes status_display_visibility
  // from the current preferences — a stale cached session would otherwise keep
  // showing the old effective visibility until the next unrelated refetch.
  return {
    update: useMutation({
      mutationFn: settingsApi.updateStatusDisplayPreferences,
      onSuccess: () => {
        invalidate();
        queryClient.invalidateQueries({ queryKey: ['roomSessions'] });
      },
    }),
  };
}
