import { api } from './client.js';

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'bundle.zip';
  a.click();
  URL.revokeObjectURL(url);
}

export const contentBundleApi = {
  exportCharacter: async (id) => {
    const { blob, filename } = await api.getBlob(`/characters/${id}/export-bundle`);
    triggerDownload(blob, filename);
  },
  exportWorld: async (id, { includeRoomTemplates, includeCharacters }) => {
    const params = new URLSearchParams();
    if (includeRoomTemplates) params.set('include_room_templates', '1');
    if (includeCharacters) params.set('include_characters', '1');
    const { blob, filename } = await api.getBlob(`/worlds/${id}/export-bundle?${params.toString()}`);
    triggerDownload(blob, filename);
  },
  exportRoomTemplate: async (id, { includeCharacters }) => {
    const params = new URLSearchParams();
    if (includeCharacters) params.set('include_characters', '1');
    const { blob, filename } = await api.getBlob(`/room-templates/${id}/export-bundle?${params.toString()}`);
    triggerDownload(blob, filename);
  },
  exportEventDefinitions: async (ids) => {
    const { blob, filename } = await api.getBlob(`/event-definitions/export-bundle?ids=${ids.join(',')}`);
    triggerDownload(blob, filename);
  },
  exportPlaythrough: async (id, { includeMessages } = {}) => {
    const params = new URLSearchParams();
    if (includeMessages) params.set('include_messages', '1');
    const { blob, filename } = await api.getBlob(`/playthroughs/${id}/export-bundle?${params.toString()}`);
    triggerDownload(blob, filename);
  },
  import: (file, targetWorldId) => {
    const formData = new FormData();
    formData.append('bundle', file);
    if (targetWorldId) formData.append('target_world_id', String(targetWorldId));
    return api.post('/content-bundle/import', formData);
  },
};

// EventsPage.jsx's handleImportFile pattern (window.alert summary), generalized
// for the {created: {worlds, room_templates, characters}, warnings} shape shared
// by every bundle kind.
export function formatBundleImportSummary({ created, warnings }) {
  const parts = [];
  if (created.worlds.length > 0) parts.push(`World: ${created.worlds.map((w) => w.name).join('、')}`);
  if (created.room_templates.length > 0) parts.push(`部屋テンプレート: ${created.room_templates.map((r) => r.name).join('、')}`);
  if (created.characters.length > 0) parts.push(`キャラクター: ${created.characters.map((c) => c.name).join('、')}`);
  if (created.playthroughs?.length > 0) parts.push(`ルート: ${created.playthroughs.map((p) => p.name).join('、')}`);
  let message = `インポートしました。\n\n${parts.join('\n')}`;
  if (warnings.length > 0) message += `\n\n警告:\n${warnings.join('\n')}`;
  return message;
}
