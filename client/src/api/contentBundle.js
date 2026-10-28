import { api } from './client.js';
import { askImportDecisions } from '../components/ImportConflictDialog.jsx';

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
  exportOutfitMasters: async (ids) => {
    const { blob, filename } = await api.getBlob(`/outfit-masters/export-bundle?ids=${ids.join(',')}`);
    triggerDownload(blob, filename);
  },
  exportPlaythrough: async (id, { includeMessages } = {}) => {
    const params = new URLSearchParams();
    if (includeMessages) params.set('include_messages', '1');
    const { blob, filename } = await api.getBlob(`/playthroughs/${id}/export-bundle?${params.toString()}`);
    triggerDownload(blob, filename);
  },
  // 取り込み前の確認: このファイルのうち、既に同名が存在するものの一覧(何も変更しない)。
  preview: (file, targetWorldId) => {
    const formData = new FormData();
    formData.append('bundle', file);
    if (targetWorldId) formData.append('target_world_id', String(targetWorldId));
    return api.post('/content-bundle/preview', formData);
  },
  // decisions: { "<種別>:<名前>": 'overwrite'|'new'|'skip' }。無い同名は従来どおり新規作成になる。
  import: (file, targetWorldId, decisions) => {
    const formData = new FormData();
    formData.append('bundle', file);
    if (targetWorldId) formData.append('target_world_id', String(targetWorldId));
    if (decisions) formData.append('decisions', JSON.stringify(decisions));
    return api.post('/content-bundle/import', formData);
  },
  // 同名の既存データがあれば1件ごとに「上書き/別名で新規/スキップ」を確認してから取り込む。
  // 同名が無ければ確認なしでそのまま取り込む。確認でキャンセルされたら何もせず null を返す。
  importWithConfirm: async (file, targetWorldId) => {
    const { conflicts } = await contentBundleApi.preview(file, targetWorldId);
    let decisions;
    if (conflicts.length > 0) {
      decisions = await askImportDecisions({ fileName: file.name, conflicts });
      if (decisions === null) return null;
    }
    return contentBundleApi.import(file, targetWorldId, decisions);
  },
};

// EventsPage.jsx's handleImportFile pattern (window.alert summary), generalized
// for the {created: {worlds, room_templates, characters}, warnings} shape shared
// by every bundle kind.
const KIND_LABELS = {
  world: 'World',
  room_template: '部屋',
  character: 'キャラクター',
  character_status: 'キャラ状態',
  event_definition: 'イベント',
  outfit_master: '衣装マスタ',
};

// 「上書き」「スキップ」を選んだ分(種別→名前の配列)を、種別ごとに並べる。
function formatDecisionGroup(title, byKind) {
  const lines = Object.entries(byKind ?? {})
    .filter(([, names]) => names.length > 0)
    .map(([kind, names]) => `${KIND_LABELS[kind] ?? kind}: ${names.join('、')}`);
  return lines.length > 0 ? `${title}\n${lines.join('\n')}` : null;
}

export function formatBundleImportSummary({ created, updated, skipped, warnings }) {
  const parts = [];
  if (created.worlds.length > 0) parts.push(`World: ${created.worlds.map((w) => w.name).join('、')}`);
  if (created.room_templates.length > 0) parts.push(`部屋テンプレート: ${created.room_templates.map((r) => r.name).join('、')}`);
  if (created.characters.length > 0) parts.push(`キャラクター: ${created.characters.map((c) => c.name).join('、')}`);
  if (created.playthroughs?.length > 0) parts.push(`ルート: ${created.playthroughs.map((p) => p.name).join('、')}`);
  if (created.outfit_masters?.length > 0) parts.push(`衣装マスタ: ${created.outfit_masters.map((m) => m.name).join('、')}`);
  // 上書き・スキップだけの取り込みでは新規に作ったものが無いので、空の見出しにならないようにする。
  let message = parts.length > 0 ? `インポートしました。\n\n${parts.join('\n')}` : 'インポートしました。（新規に追加したものはありません）';
  const updatedText = formatDecisionGroup('【上書きしたもの】', updated);
  if (updatedText) message += `\n\n${updatedText}`;
  const skippedText = formatDecisionGroup('【スキップしたもの】', skipped);
  if (skippedText) message += `\n\n${skippedText}`;
  if (warnings.length > 0) message += `\n\n警告:\n${warnings.join('\n')}`;
  return message;
}
