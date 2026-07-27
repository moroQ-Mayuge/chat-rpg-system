import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEventDefinitions, useEventDefinitionMutations, useEventOverrides, useEventOverrideMutations } from '../hooks/useEvents.js';
import { useCharacters } from '../hooks/useCharacters.js';
import { useRelationshipAxes } from '../hooks/useRelationshipAxes.js';
import { useExpressionTypes } from '../hooks/useExpressionTypes.js';
import { useRoomTemplates } from '../hooks/useRoomTemplates.js';
import { useAllItems } from '../hooks/useItems.js';
import { useAllCharacterStatuses } from '../hooks/useCharacterStatuses.js';
import { useWorlds } from '../hooks/useWorlds.js';
import GroupedList from '../components/ui/GroupedList.jsx';
import { groupByKeys } from '../utils/grouping.js';
import { useMobileListToggle } from '../hooks/useMobileListToggle.js';
import { eventsApi } from '../api/events.js';
import { contentBundleApi, formatBundleImportSummary } from '../api/contentBundle.js';

// scope==='global' events have no World (they apply everywhere) — bucketed
// separately from the World-unassigned "未分類" fallback groupByKeys would
// otherwise use, since "global" and "unassigned" mean different things here.
const GLOBAL_GROUP_KEY = '__global__';

function buildEventGroups(definitions, worlds) {
  const globalDefs = definitions.filter((d) => d.scope === 'global');
  const scopedDefs = definitions.filter((d) => d.scope !== 'global');
  const worldGroups = groupByKeys(
    scopedDefs,
    (d) => d.world_ids,
    (worldId) => worlds.find((w) => w.id === worldId)?.name ?? `World#${worldId}`,
  );
  if (globalDefs.length === 0) return worldGroups;
  return [{ key: GLOBAL_GROUP_KEY, label: 'global（全部屋共通）', isUnassigned: false, items: globalDefs }, ...worldGroups];
}

// Mirrors server/src/db/repositories/outfitsRepo.js's OUTFIT_TAG_FIELDS and
// server/src/services/outfitTagCategories.js's RANGE_NAMES -- client code
// can't import server modules, so this is a display-only copy kept for the
// ${target1.category} placeholder reference below. Order matches the server
// arrays for easy comparison.
const OUTFIT_TAG_CATEGORY_KEYS = [
  'main_features',
  'hairstyle',
  'clothing_main',
  'clothing_face',
  'clothing_upper',
  'clothing_lower',
  'clothing_legs',
  'shoes',
  'clothing_face_outer',
  'clothing_upper_outer',
  'clothing_lower_outer',
  'clothing_legs_outer',
  'clothing_face_equipment',
  'clothing_upper_equipment',
  'clothing_lower_equipment',
  'clothing_legs_equipment',
  'underwear_upper',
  'underwear_lower',
  'belongings',
];
const OUTFIT_TAG_RANGE_NAMES = ['upperbody', 'cowboyshot', 'lowerbody', 'fullbody'];
const OUTFIT_TAG_RANGE_SUFFIXES = ['', '_outer', '_equipment', '_full'];

const CONDITION_TYPES = [
  { value: 'probability', label: '確率' },
  { value: 'turn_count', label: '経過ターン数' },
  { value: 'keyword', label: 'キーワード検出' },
  { value: 'relationship_threshold', label: '関係性閾値' },
  { value: 'flag_state', label: 'フラグ状態' },
  { value: 'participant_count', label: '同席人数' },
  { value: 'has_item', label: '所持アイテム' },
  { value: 'has_status', label: 'ステータス所持' },
  { value: 'has_outfit', label: '着用中の衣装' },
  { value: 'has_money', label: '所持金' },
  { value: 'llm_judge', label: 'LLM判定' },
];

const ACTION_TYPES = [
  { value: 'insert_dialogue', label: '台詞・ナレーション挿入' },
  { value: 'character_join', label: 'キャラ参加' },
  { value: 'character_leave', label: 'キャラ退出' },
  { value: 'generate_image', label: '画像生成' },
  { value: 'set_flag', label: 'フラグ操作' },
  { value: 'change_relationship', label: '関係性パラメータ変更' },
  { value: 'change_outfit', label: '衣装変更' },
  { value: 'advance_time', label: '時間経過' },
  { value: 'grant_item', label: 'アイテム付与' },
  { value: 'make_item_available', label: 'アイテムを拾える状態にする' },
  { value: 'grant_random_item', label: 'アイテム付与（重み付き抽選）' },
  { value: 'remove_item', label: 'アイテム削除' },
  { value: 'change_status', label: 'ステータス変更' },
  { value: 'set_address', label: '呼び方変更' },
  { value: 'spend_money', label: '所持金消費' },
  { value: 'set_scene_situation', label: '場面状況を設定' },
  { value: 'set_character_impression', label: 'あなたとの関係印象を変更' },
  { value: 'add_character_memory', label: '記憶を追加（ルートに永続）' },
];

function conditionDefaults(type) {
  switch (type) {
    case 'probability':
      return { chance: 0.1 };
    case 'turn_count':
      return { reference: 'playthrough_start', comparison: '>=', turns: 10, flag_key: '' };
    case 'keyword':
      return { keywords: [], match_mode: 'any', target: 'any', case_sensitive: false };
    case 'relationship_threshold':
      return { character_id: null, axis_id: null, comparison: '>=', value: 50 };
    case 'flag_state':
      return { flag_key: '', comparison: '==', value: 'true' };
    case 'participant_count':
      return { comparison: '>=', value: 1 };
    case 'has_item':
      return { item_id: null, negate: false };
    case 'has_status':
      return { character_id: null, status_id: null, negate: false };
    case 'has_outfit':
      return { character_id: null, outfit_name: '', negate: false };
    case 'has_money':
      return { comparison: '>=', value: 1000 };
    case 'llm_judge':
      return { question: '' };
    default:
      return {};
  }
}

function actionDefaults(type) {
  switch (type) {
    case 'insert_dialogue':
      return { mode: 'fixed', character_id: null, text: '', prompt_hint: '', emotion_tag: null };
    case 'character_join':
      return {
        selection_mode: 'specific',
        character_id: null,
        candidate_character_ids: [],
        outfit_id: null,
        entrance_narration: '',
        require_attribute_match: false,
        rejection_narration: '',
      };
    case 'character_leave':
      return { selection_mode: 'specific', character_id: null, exit_narration: '' };
    case 'generate_image':
      return { image_type: 'event', prompt_override: '', target_character_ids: [], auto_append_unreferenced: true };
    case 'set_flag':
      return { flag_key: '', operation: 'set', value: '' };
    case 'change_relationship':
      return { character_id: null, axis_id: null, operation: 'add', value: 5 };
    case 'change_outfit':
      return { character_id: null, outfit_id: null };
    case 'advance_time':
      return { slots: 1 };
    case 'make_item_available':
      return { item_id: null };
    case 'grant_item':
    case 'remove_item':
      return { item_id: null, quantity: 1 };
    case 'grant_random_item':
      return { pool: [], quantity: 1 };
    case 'change_status':
      return { character_id: null, status_id: null, operation: 'grant', locked: false };
    case 'set_address':
      return { character_id: null, address: '' };
    case 'set_character_impression':
      return { character_id: null, field_key: '', value: '' };
    case 'add_character_memory':
      return { character_id: null, content: '', is_pinned: false };
    case 'spend_money':
      return { amount: 1000 };
    case 'set_scene_situation':
      return { text: '' };
    default:
      return {};
  }
}

const emptyEvent = {
  name: '',
  scope: 'global',
  room_template_id: null,
  enabled: true,
  condition_logic: 'AND',
  priority: 0,
  cooldown_turns: 0,
  max_fires_per_session: null,
  exclusive_group: null,
  reset_scope: 'playthrough',
  has_outcome_branch: false,
  outcome_logic: 'AND',
  outcome_root_label: '',
  prerequisite_event_definition_id: null,
  requires_prerequisite_outcome: 'any',
  prerequisite_reset_scope: 'playthrough',
  conditions: [],
  actions: [],
  outcome_nodes: [],
};

// Mirrored in server/src/db/repositories/eventDefinitionsRepo.js and
// server/src/services/eventEngine/index.js -- see 0061_event_outcome_nesting.sql
// for why (form/QA-burden cap, not a schema limitation).
const MAX_OUTCOME_NODE_DEPTH = 2;

let nextOutcomeNodeKey = 1;
// Only meaningful within one save payload (see eventDefinitionsRepo.js's
// insertOutcomeNodes) -- a string so it can never collide with a real
// integer id loaded from the server.
function newOutcomeNodeId() {
  return `new-${nextOutcomeNodeKey++}`;
}

const rowStyle = { background: '#f7f7f7', border: '1px solid #eee', borderRadius: 6, padding: 10, marginBottom: 8 };
const rowHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 };
const grid3 = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 };
const label11 = { fontSize: 11, color: '#888', display: 'block', marginBottom: 2 };

// Shown next to a "対象キャラ" selector whenever character_id === 'mentioned',
// to cap how many of the @-mentioned characters (in mention order) the
// multi-target condition/action applies to. Blank = no cap (all mentioned).
function MentionedLimitField({ value, onChange }) {
  return (
    <label>
      <span style={label11}>@メンション上限人数（空欄=全員）</span>
      <input type="number" min="1" value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} />
    </label>
  );
}

function ConditionEditor({ condition, characters, axes, items, statuses, hasOutcomeBranch, fixedPhase, onChange, onRemove }) {
  const p = condition.params;
  const setParams = (patch) => onChange({ ...condition, params: { ...p, ...patch } });
  const [keywordDraft, setKeywordDraft] = useState('');

  function addKeyword() {
    const value = keywordDraft.trim();
    if (!value) return;
    setParams({ keywords: [...(p.keywords ?? []), value] });
    setKeywordDraft('');
  }

  return (
    <div style={rowStyle}>
      <div style={rowHeaderStyle}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select
            value={condition.condition_type}
            onChange={(e) => onChange({ ...condition, condition_type: e.target.value, params: conditionDefaults(e.target.value) })}
          >
            {CONDITION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {!fixedPhase && hasOutcomeBranch && (
            <select value={condition.phase ?? 'trigger'} onChange={(e) => onChange({ ...condition, phase: e.target.value })}>
              <option value="trigger">発火条件</option>
              <option value="outcome">結果判定条件</option>
            </select>
          )}
        </div>
        <button onClick={onRemove}>削除</button>
      </div>

      {condition.condition_type === 'probability' && (
        <label>
          <span style={label11}>発生確率（0〜1）</span>
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={p.chance ?? 0}
            onChange={(e) => setParams({ chance: Number(e.target.value) })}
          />
        </label>
      )}

      {condition.condition_type === 'turn_count' && (
        <div style={grid3}>
          <label>
            <span style={label11}>基準</span>
            <select value={p.reference} onChange={(e) => setParams({ reference: e.target.value })}>
              <option value="playthrough_start">ルート開始から</option>
              <option value="flag_set">フラグが立ってから</option>
              <option value="last_fire_of_this_event">前回自身の発火から</option>
            </select>
          </label>
          {p.reference === 'flag_set' && (
            <label>
              <span style={label11}>フラグキー</span>
              <input value={p.flag_key ?? ''} onChange={(e) => setParams({ flag_key: e.target.value })} />
            </label>
          )}
          <label>
            <span style={label11}>比較</span>
            <select value={p.comparison} onChange={(e) => setParams({ comparison: e.target.value })}>
              <option value=">=">{'>='}</option>
              <option value="==">{'=='}</option>
              <option value=">">{'>'}</option>
            </select>
          </label>
          <label>
            <span style={label11}>ターン数</span>
            <input type="number" value={p.turns ?? 0} onChange={(e) => setParams({ turns: Number(e.target.value) })} />
          </label>
        </div>
      )}

      {condition.condition_type === 'keyword' && (
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {(p.keywords ?? []).map((kw, i) => (
              <span key={i} style={{ fontSize: 12, background: '#dbeafe', padding: '3px 8px', borderRadius: 10 }}>
                {kw}{' '}
                <button
                  style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11 }}
                  onClick={() => setParams({ keywords: p.keywords.filter((_, idx) => idx !== i) })}
                >
                  ×
                </button>
              </span>
            ))}
            <span style={{ display: 'inline-flex', gap: 4 }}>
              <input
                placeholder="キーワードを入力"
                style={{ fontSize: 12, width: 160 }}
                value={keywordDraft}
                onChange={(e) => setKeywordDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
              />
              <button type="button" style={{ fontSize: 12 }} onClick={addKeyword} disabled={!keywordDraft.trim()}>
                + 追加
              </button>
            </span>
          </div>
          <div style={grid3}>
            <label>
              <span style={label11}>一致方法</span>
              <select value={p.match_mode} onChange={(e) => setParams({ match_mode: e.target.value })}>
                <option value="any">いずれか一致</option>
                <option value="all">すべて含む</option>
              </select>
            </label>
            <label>
              <span style={label11}>対象</span>
              <select value={p.target} onChange={(e) => setParams({ target: e.target.value })}>
                <option value="user_message">ユーザー発言</option>
                <option value="ai_response">AI応答</option>
                <option value="any">両方</option>
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
              <input
                type="checkbox"
                checked={p.case_sensitive ?? false}
                onChange={(e) => setParams({ case_sensitive: e.target.checked })}
              />
              <span style={{ fontSize: 12 }}>大文字小文字を区別</span>
            </label>
          </div>
        </div>
      )}

      {condition.condition_type === 'relationship_threshold' && (
        <div style={grid3}>
          <label>
            <span style={label11}>対象キャラ</span>
            <select
              value={p.character_id ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setParams({ character_id: v === 'any_present' || v === 'mentioned' ? v : Number(v) || null });
              }}
            >
              <option value="">選択してください</option>
              <option value="any_present">同席者の誰か1人でも</option>
              <option value="mentioned">@メンション中のキャラ</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span style={label11}>関係性軸</span>
            <select value={p.axis_id ?? ''} onChange={(e) => setParams({ axis_id: Number(e.target.value) || null })}>
              <option value="">選択してください</option>
              {axes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <label style={{ flex: 1 }}>
              <span style={label11}>比較</span>
              <select value={p.comparison} onChange={(e) => setParams({ comparison: e.target.value })}>
                {['>=', '<=', '==', '>', '<'].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ flex: 1 }}>
              <span style={label11}>値</span>
              <input type="number" value={p.value ?? 0} onChange={(e) => setParams({ value: Number(e.target.value) })} />
            </label>
          </div>
          {p.character_id === 'mentioned' && (
            <MentionedLimitField value={p.mentioned_limit} onChange={(v) => setParams({ mentioned_limit: v })} />
          )}
        </div>
      )}

      {condition.condition_type === 'flag_state' && (
        <div style={grid3}>
          <label>
            <span style={label11}>フラグキー</span>
            <input value={p.flag_key ?? ''} onChange={(e) => setParams({ flag_key: e.target.value })} />
          </label>
          <label>
            <span style={label11}>比較</span>
            <select value={p.comparison} onChange={(e) => setParams({ comparison: e.target.value })}>
              <option value="==">{'=='}</option>
              <option value="!=">{'!='}</option>
              <option value="exists">存在する</option>
              <option value="not_exists">存在しない</option>
            </select>
          </label>
          {p.comparison !== 'exists' && p.comparison !== 'not_exists' && (
            <label>
              <span style={label11}>値</span>
              <input value={p.value ?? ''} onChange={(e) => setParams({ value: e.target.value })} />
            </label>
          )}
          <label>
            <span style={label11}>対象キャラ（未指定=グローバル）</span>
            <select
              value={p.character_id ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setParams({ character_id: v === 'any_present' || v === 'mentioned' ? v : Number(v) || null });
              }}
            >
              <option value="">未指定（グローバル）</option>
              <option value="any_present">同席者の誰か1人でも</option>
              <option value="mentioned">@メンション中のキャラ</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {p.character_id != null && (
            <label>
              <span style={label11}>スコープ</span>
              <select value={p.scope ?? 'playthrough'} onChange={(e) => setParams({ scope: e.target.value })}>
                <option value="playthrough">ルート永続</option>
                <option value="session">セッション内一時</option>
              </select>
            </label>
          )}
          {p.character_id === 'mentioned' && (
            <MentionedLimitField value={p.mentioned_limit} onChange={(v) => setParams({ mentioned_limit: v })} />
          )}
        </div>
      )}

      {condition.condition_type === 'participant_count' && (
        <div style={{ display: 'flex', gap: 6 }}>
          <label style={{ flex: 1 }}>
            <span style={label11}>比較</span>
            <select value={p.comparison} onChange={(e) => setParams({ comparison: e.target.value })}>
              <option value=">=">{'>='}</option>
              <option value="<=">{'<='}</option>
              <option value="==">{'=='}</option>
            </select>
          </label>
          <label style={{ flex: 1 }}>
            <span style={label11}>人数</span>
            <input type="number" value={p.value ?? 0} onChange={(e) => setParams({ value: Number(e.target.value) })} />
          </label>
        </div>
      )}

      {condition.condition_type === 'has_money' && (
        <div style={{ display: 'flex', gap: 6 }}>
          <label style={{ flex: 1 }}>
            <span style={label11}>比較</span>
            <select value={p.comparison} onChange={(e) => setParams({ comparison: e.target.value })}>
              <option value=">=">{'>='}</option>
              <option value="<=">{'<='}</option>
              <option value="==">{'=='}</option>
              <option value=">">{'>'}</option>
              <option value="<">{'<'}</option>
            </select>
          </label>
          <label style={{ flex: 1 }}>
            <span style={label11}>所持金</span>
            <input type="number" value={p.value ?? 0} onChange={(e) => setParams({ value: Number(e.target.value) })} />
          </label>
        </div>
      )}

      {condition.condition_type === 'has_item' && (
        <div style={{ display: 'flex', gap: 6 }}>
          <label style={{ flex: 1 }}>
            <span style={label11}>アイテム</span>
            <select value={p.item_id ?? ''} onChange={(e) => setParams({ item_id: Number(e.target.value) || null })}>
              <option value="">選択してください</option>
              {(items ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
            <input type="checkbox" checked={p.negate ?? false} onChange={(e) => setParams({ negate: e.target.checked })} />
            <span style={{ fontSize: 12 }}>持っていない場合に成立</span>
          </label>
        </div>
      )}

      {condition.condition_type === 'has_status' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <label style={{ flex: 1 }}>
            <span style={label11}>対象キャラ</span>
            <select
              value={p.character_id ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setParams({ character_id: v === 'any_present' || v === 'mentioned' ? v : Number(v) || null });
              }}
            >
              <option value="">選択してください</option>
              <option value="any_present">同席者の誰か1人でも</option>
              <option value="mentioned">@メンション中のキャラ</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1 }}>
            <span style={label11}>ステータス</span>
            <select value={p.status_id ?? ''} onChange={(e) => setParams({ status_id: Number(e.target.value) || null })}>
              <option value="">選択してください</option>
              {(statuses ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
            <input type="checkbox" checked={p.negate ?? false} onChange={(e) => setParams({ negate: e.target.checked })} />
            <span style={{ fontSize: 12 }}>持っていない場合に成立</span>
          </label>
          {p.character_id === 'mentioned' && (
            <MentionedLimitField value={p.mentioned_limit} onChange={(v) => setParams({ mentioned_limit: v })} />
          )}
        </div>
      )}

      {condition.condition_type === 'has_outfit' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <label style={{ flex: 1 }}>
            <span style={label11}>対象キャラ</span>
            <select
              value={p.character_id ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setParams({ character_id: v === 'any_present' || v === 'mentioned' ? v : Number(v) || null });
              }}
            >
              <option value="">選択してください</option>
              <option value="any_present">同席者の誰か1人でも</option>
              <option value="mentioned">@メンション中のキャラ</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1 }}>
            <span style={label11}>衣装名（例：水着）</span>
            <input style={{ width: '100%' }} value={p.outfit_name ?? ''} onChange={(e) => setParams({ outfit_name: e.target.value })} />
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
            <input type="checkbox" checked={p.negate ?? false} onChange={(e) => setParams({ negate: e.target.checked })} />
            <span style={{ fontSize: 12 }}>着ていない場合に成立</span>
          </label>
          {p.character_id === 'mentioned' && (
            <MentionedLimitField value={p.mentioned_limit} onChange={(v) => setParams({ mentioned_limit: v })} />
          )}
        </div>
      )}

      {condition.condition_type === 'llm_judge' && (
        <div>
          <label>
            <span style={label11}>LLMへの質問（yes/noで判定）</span>
            <input
              style={{ width: '100%' }}
              placeholder="ユーザーはキャラクターに対して友好的な態度を取っているか？"
              value={p.question ?? ''}
              onChange={(e) => setParams({ question: e.target.value })}
            />
          </label>
          <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
            直近のユーザー発言とAI応答を読み、この質問にyes/noで判定させます。判定コストがかかるため多用は避けてください。
          </p>
        </div>
      )}
    </div>
  );
}

function ActionEditor({ action, characters, axes, expressionTypes, items, statuses, hasOutcomeBranch, onChange, onRemove }) {
  const p = action.params;
  const setParams = (patch) => onChange({ ...action, params: { ...p, ...patch } });
  const charOptions = characters.map((c) => (
    <option key={c.id} value={c.id}>
      {c.name}
    </option>
  ));

  return (
    <div style={rowStyle}>
      <div style={rowHeaderStyle}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select
            value={action.action_type}
            onChange={(e) => onChange({ ...action, action_type: e.target.value, params: actionDefaults(e.target.value) })}
          >
            {ACTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {hasOutcomeBranch && (
            <select value={action.outcome ?? 'always'} onChange={(e) => onChange({ ...action, outcome: e.target.value })}>
              <option value="always">常に実行</option>
              <option value="success">成功時のみ</option>
              <option value="failure">失敗時のみ</option>
            </select>
          )}
        </div>
        <button onClick={onRemove}>削除</button>
      </div>

      {action.action_type === 'insert_dialogue' && (
        <div>
          <div style={grid3}>
            <label>
              <span style={label11}>モード</span>
              <select value={p.mode} onChange={(e) => setParams({ mode: e.target.value })}>
                <option value="fixed">固定文</option>
                <option value="generated">生成</option>
              </select>
            </label>
            <label>
              <span style={label11}>発言者</span>
              <select
                value={p.character_id ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setParams({ character_id: v === '' ? null : v === 'mentioned' ? 'mentioned' : Number(v) });
                }}
              >
                <option value="">ナレーション</option>
                <option value="mentioned">@メンション中のキャラ（先頭1人）</option>
                {charOptions}
              </select>
            </label>
            {p.character_id != null && (
              <label>
                <span style={label11}>表情タグ（任意）</span>
                <select value={p.emotion_tag ?? ''} onChange={(e) => setParams({ emotion_tag: e.target.value || null })}>
                  <option value="">自動</option>
                  {expressionTypes.map((et) => (
                    <option key={et.llm_tag_key} value={et.llm_tag_key}>
                      {et.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {p.mode === 'fixed' ? (
            <>
              <input
                style={{ width: '100%', marginTop: 8 }}
                placeholder="固定の台詞・ナレーション文（例：${target1}が顔を赤らめる）"
                value={p.text ?? ''}
                onChange={(e) => setParams({ text: e.target.value })}
              />
              <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                ${'{キャラ名}'} で固定のキャラ名に、${'{target1}'} ${'{target2}'}
                …で「@メンション中のキャラ（いなければ同席者全員）」の順番のキャラ名に、それぞれ置換されます。
              </p>
            </>
          ) : (
            <input
              style={{ width: '100%', marginTop: 8 }}
              placeholder="生成ヒント：少し照れながら本音を漏らす一言を発言する"
              value={p.prompt_hint ?? ''}
              onChange={(e) => setParams({ prompt_hint: e.target.value })}
            />
          )}
        </div>
      )}

      {action.action_type === 'character_join' && (
        <div>
          <div style={grid3}>
            <label>
              <span style={label11}>選出方法</span>
              <select value={p.selection_mode} onChange={(e) => setParams({ selection_mode: e.target.value })}>
                <option value="specific">指定</option>
                <option value="random_weighted">重み付き抽選</option>
                <option value="random_uniform">均等抽選</option>
                <option value="tag_match">属性キー一致</option>
              </select>
            </label>
            {p.selection_mode === 'specific' && (
              <label>
                <span style={label11}>対象キャラ</span>
                <select
                  value={p.character_id ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setParams({ character_id: v === 'mentioned' ? 'mentioned' : Number(v) || null });
                  }}
                >
                  <option value="">選択してください</option>
                  <option value="mentioned">@メンション中のキャラ（先頭1人）</option>
                  {charOptions}
                </select>
              </label>
            )}
            {(p.selection_mode === 'random_weighted' || p.selection_mode === 'random_uniform') && (
              <label>
                <span style={label11}>候補キャラ（複数選択）</span>
                <select
                  multiple
                  value={(p.candidate_character_ids ?? []).map(String)}
                  onChange={(e) => setParams({ candidate_character_ids: Array.from(e.target.selectedOptions, (o) => Number(o.value)) })}
                >
                  {charOptions}
                </select>
              </label>
            )}
            {p.selection_mode === 'tag_match' && (
              <p style={{ fontSize: 11, color: '#888', gridColumn: 'span 2', margin: 0 }}>
                この部屋またはそのWorldの属性キーと、キャラクター編集画面で設定した属性キーが一致するキャラから重み付き抽選します（候補の手動指定は不要）。
              </p>
            )}
          </div>
          {p.selection_mode === 'specific' && (
            <div style={{ marginTop: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={p.require_attribute_match ?? false}
                  onChange={(e) => setParams({ require_attribute_match: e.target.checked })}
                />
                対象キャラの属性キーが部屋/Worldと一致しない場合は入室させない
              </label>
              {p.require_attribute_match && (
                <input
                  style={{ width: '100%', marginTop: 4 }}
                  placeholder="不一致時のナレーション（{character_name}で置換、空欄で既定文）"
                  value={p.rejection_narration ?? ''}
                  onChange={(e) => setParams({ rejection_narration: e.target.value })}
                />
              )}
            </div>
          )}
          <input
            style={{ width: '100%', marginTop: 8 }}
            placeholder="入室ナレーション（{character_name}で置換）"
            value={p.entrance_narration ?? ''}
            onChange={(e) => setParams({ entrance_narration: e.target.value })}
          />
        </div>
      )}

      {action.action_type === 'character_leave' && (
        <div>
          <div style={grid3}>
            <label>
              <span style={label11}>選出方法</span>
              <select value={p.selection_mode} onChange={(e) => setParams({ selection_mode: e.target.value })}>
                <option value="specific">指定</option>
                <option value="random_from_present">同席者からランダム</option>
              </select>
            </label>
            {p.selection_mode === 'specific' && (
              <label>
                <span style={label11}>対象キャラ</span>
                <select
                  value={p.character_id ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setParams({ character_id: v === 'mentioned' ? 'mentioned' : Number(v) || null });
                  }}
                >
                  <option value="">選択してください</option>
                  <option value="mentioned">@メンション中のキャラ（先頭1人）</option>
                  {charOptions}
                </select>
              </label>
            )}
          </div>
          <input
            style={{ width: '100%', marginTop: 8 }}
            placeholder="退室ナレーション（{character_name}で置換）"
            value={p.exit_narration ?? ''}
            onChange={(e) => setParams({ exit_narration: e.target.value })}
          />
        </div>
      )}

      {action.action_type === 'generate_image' && (
        <div>
          <div style={grid3}>
            <label>
              <span style={label11}>画像種別</span>
              <select value={p.image_type} onChange={(e) => setParams({ image_type: e.target.value })}>
                <option value="event">イベント用</option>
                <option value="scene">シーン（現在シーン画像を更新）</option>
              </select>
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              <span style={label11}>対象キャラ（複数選択・空欄は@メンション優先→同席者全員）</span>
              <select
                multiple
                value={(p.target_character_ids ?? []).map(String)}
                onChange={(e) => setParams({ target_character_ids: Array.from(e.target.selectedOptions, (o) => Number(o.value)) })}
              >
                {charOptions}
              </select>
            </label>
            <MentionedLimitField value={p.mentioned_limit} onChange={(v) => setParams({ mentioned_limit: v })} />
          </div>
          <textarea
            style={{ width: '100%', marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}
            rows={2}
            placeholder="${みお}, blush, on top of, ${target1}, lying down"
            value={p.prompt_override ?? ''}
            onChange={(e) => setParams({ prompt_override: e.target.value })}
          />
          <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
            ${'{キャラ名}'} で固定のキャラを、${'{target1}'} ${'{target2}'} …で「対象キャラ」欄で選んだ順番のキャラを、それぞれ現在衣装のdanbooruタグに置換します（対象キャラ未選択時は@メンション優先→同席者全員の順）。具体的な性的表現の内容はここで自由入力してください。
          </p>
          <p style={{ fontSize: 11, color: '#888', margin: '2px 0 0' }}>
            ${'{target1.category}'} のように末尾に「.カテゴリ名」を付けると、衣装タグの一部だけを個別に指定できます（現在の脱衣状態で抑制されているタグ列は自動的に除外されます）。
          </p>
          <details style={{ marginTop: 2 }}>
            <summary style={{ fontSize: 11, color: '#888', cursor: 'pointer' }}>使用可能なカテゴリ一覧</summary>
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              <p style={{ margin: '0 0 4px' }}>
                <strong>個別列</strong>：{OUTFIT_TAG_CATEGORY_KEYS.map((k) => `${'{target1.'}${k}${'}'}`).join('　')}
              </p>
              <p style={{ margin: 0 }}>
                <strong>範囲プリセット</strong>（末尾なし＝ベース衣装のみ、_outer＝上着、_equipment＝追加装備、_full＝ベース＋上着＋追加装備）：
                {OUTFIT_TAG_RANGE_NAMES.map((range) => (
                  <span key={range} style={{ display: 'block', marginTop: 2 }}>
                    {range}：{OUTFIT_TAG_RANGE_SUFFIXES.map((suf) => `${'{target1.'}${range}${suf}${'}'}`).join('　')}
                  </span>
                ))}
              </p>
            </div>
          </details>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 6 }}>
            <input
              type="checkbox"
              checked={p.auto_append_unreferenced ?? true}
              onChange={(e) => setParams({ auto_append_unreferenced: e.target.checked })}
            />
            取りこぼし防止：${'{target}'}で参照されなかった同席キャラの服装タグも自動追加する
          </label>
        </div>
      )}

      {action.action_type === 'set_flag' && (
        <div style={grid3}>
          <label>
            <span style={label11}>フラグキー</span>
            <input value={p.flag_key ?? ''} onChange={(e) => setParams({ flag_key: e.target.value })} />
          </label>
          <label>
            <span style={label11}>操作</span>
            <select value={p.operation} onChange={(e) => setParams({ operation: e.target.value })}>
              <option value="set">設定</option>
              <option value="increment">増加</option>
              <option value="decrement">減少</option>
              <option value="toggle">反転</option>
            </select>
          </label>
          <label>
            <span style={label11}>値</span>
            <input value={p.value ?? ''} onChange={(e) => setParams({ value: e.target.value })} />
          </label>
          <label>
            <span style={label11}>対象キャラ（未指定=グローバル）</span>
            <select
              value={p.character_id ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setParams({ character_id: v === 'all_present' || v === 'mentioned' ? v : Number(v) || null });
              }}
            >
              <option value="">未指定（グローバル）</option>
              <option value="all_present">同席者全員</option>
              <option value="mentioned">@メンション中のキャラ</option>
              {charOptions}
            </select>
          </label>
          {p.character_id != null && (
            <label>
              <span style={label11}>スコープ</span>
              <select value={p.scope ?? 'playthrough'} onChange={(e) => setParams({ scope: e.target.value })}>
                <option value="playthrough">ルート永続</option>
                <option value="session">セッション内一時</option>
              </select>
            </label>
          )}
          {p.character_id === 'mentioned' && (
            <MentionedLimitField value={p.mentioned_limit} onChange={(v) => setParams({ mentioned_limit: v })} />
          )}
        </div>
      )}

      {action.action_type === 'change_relationship' && (
        <div style={grid3}>
          <label>
            <span style={label11}>対象キャラ</span>
            <select
              value={p.character_id ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setParams({ character_id: v === 'all_present' || v === 'mentioned' ? v : Number(v) || null });
              }}
            >
              <option value="">選択してください</option>
              <option value="all_present">同席者全員</option>
              <option value="mentioned">@メンション中のキャラ</option>
              {charOptions}
            </select>
          </label>
          <label>
            <span style={label11}>関係性軸</span>
            <select value={p.axis_id ?? ''} onChange={(e) => setParams({ axis_id: Number(e.target.value) || null })}>
              <option value="">選択してください</option>
              {axes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <label style={{ flex: 1 }}>
              <span style={label11}>操作</span>
              <select value={p.operation} onChange={(e) => setParams({ operation: e.target.value })}>
                <option value="add">加算</option>
                <option value="subtract">減算</option>
                <option value="set">設定</option>
              </select>
            </label>
            <label style={{ flex: 1 }}>
              <span style={label11}>値</span>
              <input type="number" value={p.value ?? 0} onChange={(e) => setParams({ value: Number(e.target.value) })} />
            </label>
          </div>
          {p.character_id === 'mentioned' && (
            <MentionedLimitField value={p.mentioned_limit} onChange={(v) => setParams({ mentioned_limit: v })} />
          )}
        </div>
      )}

      {action.action_type === 'change_outfit' && (
        <div style={grid3}>
          <label>
            <span style={label11}>対象キャラ</span>
            <select
              value={p.character_id ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setParams({ character_id: v === 'mentioned' ? 'mentioned' : Number(v) || null });
              }}
            >
              <option value="">選択してください</option>
              <option value="mentioned">@メンション中のキャラ（先頭1人）</option>
              {charOptions}
            </select>
          </label>
          <label>
            <span style={label11}>切り替え先衣装ID</span>
            <input type="number" value={p.outfit_id ?? ''} onChange={(e) => setParams({ outfit_id: Number(e.target.value) || null })} />
          </label>
        </div>
      )}

      {action.action_type === 'advance_time' && (
        <label>
          <span style={label11}>進める時間帯の数</span>
          <input type="number" min="1" value={p.slots ?? 1} onChange={(e) => setParams({ slots: Number(e.target.value) })} />
        </label>
      )}

      {action.action_type === 'spend_money' && (
        <label>
          <span style={label11}>消費する所持金</span>
          <input type="number" min="1" value={p.amount ?? 1} onChange={(e) => setParams({ amount: Number(e.target.value) })} />
        </label>
      )}

      {action.action_type === 'set_scene_situation' && (
        <div>
          <input
            style={{ width: '100%' }}
            placeholder="${target1}と二人きりでイチャイチャしてる"
            value={p.text ?? ''}
            onChange={(e) => setParams({ text: e.target.value })}
          />
          <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
            この部屋セッションが続く間（次にこのアクションが再実行されるか、部屋を移動するまで）、地の文生成のシステムプロンプトに「現在の場面状況：〜」として渡り続けます。${'{キャラ名}'}
            ${'{target1}'} ${'{target2}'} …のプレースホルダーが使えます（`insert_dialogue`と同じ構文、名前に置換）。
          </p>
        </div>
      )}

      {(action.action_type === 'grant_item' || action.action_type === 'remove_item') && (
        <div style={{ display: 'flex', gap: 6 }}>
          <label style={{ flex: 1 }}>
            <span style={label11}>アイテム</span>
            <select value={p.item_id ?? ''} onChange={(e) => setParams({ item_id: Number(e.target.value) || null })}>
              <option value="">選択してください</option>
              {(items ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1 }}>
            <span style={label11}>個数</span>
            <input type="number" min="1" value={p.quantity ?? 1} onChange={(e) => setParams({ quantity: Number(e.target.value) })} />
          </label>
        </div>
      )}

      {action.action_type === 'make_item_available' && (
        <div>
          <label style={{ display: 'block' }}>
            <span style={label11}>アイテム</span>
            <select value={p.item_id ?? ''} onChange={(e) => setParams({ item_id: Number(e.target.value) || null })}>
              <option value="">選択してください</option>
              {(items ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
            持ち物には直接入らず、現在の部屋で「拾う」から取れる状態になります。見つけた旨の文章は別途「セリフ・地の文を挿入」で書いてください。
          </p>
        </div>
      )}

      {action.action_type === 'grant_random_item' && (
        <div>
          <span style={label11}>候補アイテムと重み（例：鮫60・鯖30・レア鱚10 → 鮫が60/100の確率）</span>
          {(p.pool ?? []).map((entry, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <select
                style={{ flex: 2 }}
                value={entry.item_id ?? ''}
                onChange={(e) => {
                  const pool = [...p.pool];
                  pool[idx] = { ...pool[idx], item_id: Number(e.target.value) || null };
                  setParams({ pool });
                }}
              >
                <option value="">選択してください</option>
                {(items ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="1"
                style={{ flex: 1 }}
                placeholder="重み"
                value={entry.weight ?? 1}
                onChange={(e) => {
                  const pool = [...p.pool];
                  pool[idx] = { ...pool[idx], weight: Number(e.target.value) };
                  setParams({ pool });
                }}
              />
              <button onClick={() => setParams({ pool: p.pool.filter((_, i) => i !== idx) })}>削除</button>
            </div>
          ))}
          <button onClick={() => setParams({ pool: [...(p.pool ?? []), { item_id: null, weight: 1 }] })}>+ 候補を追加</button>
          <label style={{ display: 'block', marginTop: 8 }}>
            <span style={label11}>個数</span>
            <input type="number" min="1" value={p.quantity ?? 1} onChange={(e) => setParams({ quantity: Number(e.target.value) })} />
          </label>
        </div>
      )}

      {action.action_type === 'change_status' && (
        <div style={grid3}>
          <label>
            <span style={label11}>対象キャラ</span>
            <select
              value={p.character_id ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setParams({ character_id: v === 'all_present' || v === 'mentioned' ? v : Number(v) || null });
              }}
            >
              <option value="">選択してください</option>
              <option value="all_present">同席者全員</option>
              <option value="mentioned">@メンション中のキャラ</option>
              {charOptions}
            </select>
          </label>
          <label>
            <span style={label11}>ステータス</span>
            <select value={p.status_id ?? ''} onChange={(e) => setParams({ status_id: Number(e.target.value) || null })}>
              <option value="">選択してください</option>
              {(statuses ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <label style={{ flex: 1 }}>
              <span style={label11}>操作</span>
              <select value={p.operation} onChange={(e) => setParams({ operation: e.target.value })}>
                <option value="grant">付与</option>
                <option value="remove">解除</option>
                <option value="lock">ロック</option>
                <option value="unlock">ロック解除</option>
              </select>
            </label>
            {p.operation === 'grant' && (
              <label style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
                <input type="checkbox" checked={p.locked ?? false} onChange={(e) => setParams({ locked: e.target.checked })} />
                <span style={{ fontSize: 12 }}>付与と同時にロックする</span>
              </label>
            )}
          </div>
          {p.character_id === 'mentioned' && (
            <MentionedLimitField value={p.mentioned_limit} onChange={(v) => setParams({ mentioned_limit: v })} />
          )}
        </div>
      )}

      {action.action_type === 'set_address' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <label style={{ flex: 1 }}>
            <span style={label11}>対象キャラ</span>
            <select
              value={p.character_id ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setParams({ character_id: v === 'all_present' || v === 'mentioned' ? v : Number(v) || null });
              }}
            >
              <option value="">選択してください</option>
              <option value="all_present">同席者全員</option>
              <option value="mentioned">@メンション中のキャラ</option>
              {charOptions}
            </select>
          </label>
          <label style={{ flex: 2 }}>
            <span style={label11}>新しい呼び方</span>
            <input
              style={{ width: '100%' }}
              placeholder="例：あなた♡"
              value={p.address ?? ''}
              onChange={(e) => setParams({ address: e.target.value })}
            />
          </label>
          {p.character_id === 'mentioned' && (
            <MentionedLimitField value={p.mentioned_limit} onChange={(v) => setParams({ mentioned_limit: v })} />
          )}
        </div>
      )}

      {action.action_type === 'set_character_impression' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <label style={{ flex: 1 }}>
            <span style={label11}>対象キャラ</span>
            <select
              value={p.character_id ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setParams({ character_id: v === 'all_present' || v === 'mentioned' ? v : Number(v) || null });
              }}
            >
              <option value="">選択してください</option>
              <option value="all_present">同席者全員</option>
              <option value="mentioned">@メンション中のキャラ</option>
              {charOptions}
            </select>
          </label>
          <label style={{ flex: 1 }}>
            <span style={label11}>フィールド名</span>
            <input
              placeholder="例：あなたとの関係"
              value={p.field_key ?? ''}
              onChange={(e) => setParams({ field_key: e.target.value })}
            />
          </label>
          <label style={{ flex: 2, minWidth: '100%' }}>
            <span style={label11}>新しい値</span>
            <input
              style={{ width: '100%' }}
              placeholder="例：初キスしたばかりで顔を見るのが恥ずかしい"
              value={p.value ?? ''}
              onChange={(e) => setParams({ value: e.target.value })}
            />
          </label>
          {p.character_id === 'mentioned' && (
            <MentionedLimitField value={p.mentioned_limit} onChange={(v) => setParams({ mentioned_limit: v })} />
          )}
        </div>
      )}

      {action.action_type === 'add_character_memory' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <label style={{ flex: 1 }}>
            <span style={label11}>対象キャラ</span>
            <select
              value={p.character_id ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setParams({ character_id: v === 'all_present' || v === 'mentioned' ? v : Number(v) || null });
              }}
            >
              <option value="">選択してください</option>
              <option value="all_present">同席者全員</option>
              <option value="mentioned">@メンション中のキャラ</option>
              <option value="departed">このイベントで退出したキャラ</option>
              {charOptions}
            </select>
          </label>
          <label style={{ flex: 2, minWidth: '100%' }}>
            <span style={label11}>記憶の内容</span>
            <input
              style={{ width: '100%' }}
              placeholder="例：無理やりキスをされて、とても怖い思いをした"
              value={p.content ?? ''}
              onChange={(e) => setParams({ content: e.target.value })}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <input type="checkbox" checked={Boolean(p.is_pinned)} onChange={(e) => setParams({ is_pinned: e.target.checked })} />
            ピン留めする（件数上限の枠外で常にプロンプトに載る）
          </label>
          {p.character_id === 'mentioned' && (
            <MentionedLimitField value={p.mentioned_limit} onChange={(v) => setParams({ mentioned_limit: v })} />
          )}
        </div>
      )}
    </div>
  );
}

// A removed node takes any nested child (depth 2, the only descendant level
// possible under the current cap) down with it, along with every
// condition/action attached to any of them.
function collectNodeAndDescendantIds(outcomeNodes, nodeId) {
  const ids = new Set([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of outcomeNodes) {
      if (ids.has(n.parent_node_id) && !ids.has(n.id)) {
        ids.add(n.id);
        changed = true;
      }
    }
  }
  return ids;
}

// Depth-first flattening of the outcome-node tree for the outline-style
// list rendering below (root success subtree in full, then root failure
// subtree in full) -- replaces the old recursive box-in-box OutcomeNodeEditor
// (which squeezed unusably narrow on mobile at depth 2) with one flat list
// where depth is expressed as indentation/a tree-line prefix instead of
// actual DOM nesting.
function flattenOutcomeNodes(outcomeNodes) {
  const result = [];
  function visit(parentId, depth) {
    for (const branchKey of ['success', 'failure']) {
      const node = outcomeNodes.find((n) => (n.parent_node_id ?? null) === parentId && n.branch_key === branchKey);
      if (node) {
        result.push({ node, depth });
        visit(node.id, depth + 1);
      }
    }
  }
  visit(null, 1);
  return result;
}

function defaultNodeLabel(node) {
  return node.branch_key === 'success' ? '成功時のネスト' : '失敗時のネスト';
}

// Root(id=null) + every outcome node, in the same order flattenOutcomeNodes
// renders them, for the action-binding group-select below.
function listConditionGroupOptions(draft) {
  const options = [{ value: 'root', label: draft.outcome_root_label || 'ルート条件' }];
  for (const { node, depth } of flattenOutcomeNodes(draft.outcome_nodes)) {
    options.push({ value: String(node.id), label: '　'.repeat(depth) + (node.label || defaultNodeLabel(node)) });
  }
  return options;
}

// Display text for an action row showing which condition group/outcome it's
// bound to -- the user-facing point of separating actions from the
// condition tree (previously an action's binding was only implicit from
// which nested box it visually sat inside).
function describeActionBinding(action, draft) {
  if (action.outcome_node_id == null) {
    const rootLabel = draft.outcome_root_label || 'ルート条件';
    if (action.outcome === 'success') return `${rootLabel}の成功時`;
    if (action.outcome === 'failure') return `${rootLabel}の失敗時`;
    return '常に実行';
  }
  const node = draft.outcome_nodes.find((n) => n.id === action.outcome_node_id);
  const nodeLabel = node ? node.label || defaultNodeLabel(node) : '（不明な条件群）';
  if (action.outcome === 'success') return `${nodeLabel}の成功時`;
  if (action.outcome === 'failure') return `${nodeLabel}の失敗時`;
  return `${nodeLabel}到達時`;
}

// One row of the outline (root when ownNodeId===null, otherwise a nested
// node) -- a single flat box (no recursion, no nested boxes), with depth
// expressed via left padding + a tree-line prefix. Handles only this row's
// own label/logic/conditions and the "add a nested branch under me" slots;
// actual descendants render as their own separate rows via the caller's
// flattenOutcomeNodes loop.
function ConditionGroupRow({
  depth,
  ownNodeId,
  branchKey,
  label,
  onLabelChange,
  outcomeLogic,
  onOutcomeLogicChange,
  ownConditions,
  conditions,
  setConditions,
  outcomeNodes,
  setOutcomeNodes,
  canDelete,
  onDelete,
  characters,
  axes,
  items,
  statuses,
}) {
  const treePrefix = depth === 0 ? '' : '　'.repeat(depth - 1) + '└ ';
  return (
    <div style={{ ...rowStyle, marginLeft: depth * 4 }}>
      <div style={rowHeaderStyle}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#888', whiteSpace: 'pre' }}>{treePrefix}</span>
          {branchKey && (
            <span style={{ fontSize: 11, color: branchKey === 'success' ? '#2563eb' : '#dc2626' }}>
              （{branchKey === 'success' ? '成功時' : '失敗時'}）
            </span>
          )}
          <input
            style={{ fontSize: 12, width: 160 }}
            value={label}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder={depth === 0 ? 'ルート条件' : defaultNodeLabel({ branch_key: branchKey })}
          />
          <span style={label11}>結合</span>
          <select value={outcomeLogic} onChange={(e) => onOutcomeLogicChange(e.target.value)}>
            <option value="AND">AND</option>
            <option value="OR">OR</option>
          </select>
        </div>
        {canDelete && <button onClick={onDelete}>このネストを削除</button>}
      </div>

      {ownConditions.map((condition, i) => (
        <ConditionEditor
          key={i}
          condition={condition}
          characters={characters}
          axes={axes}
          items={items}
          statuses={statuses}
          hasOutcomeBranch
          fixedPhase="outcome"
          onChange={(next) => setConditions(conditions.map((c) => (c === condition ? next : c)))}
          onRemove={() => setConditions(conditions.filter((c) => c !== condition))}
        />
      ))}
      <button
        onClick={() =>
          setConditions([
            ...conditions,
            { condition_type: 'probability', params: conditionDefaults('probability'), phase: 'outcome', outcome_node_id: ownNodeId },
          ])
        }
      >
        + 条件を追加
      </button>

      {depth < MAX_OUTCOME_NODE_DEPTH && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {['success', 'failure'].map((childBranchKey) => {
            const childExists = outcomeNodes.some((n) => (n.parent_node_id ?? null) === ownNodeId && n.branch_key === childBranchKey);
            if (childExists) return null;
            return (
              <button
                key={childBranchKey}
                style={{ fontSize: 11 }}
                onClick={() =>
                  setOutcomeNodes([
                    ...outcomeNodes,
                    { id: newOutcomeNodeId(), parent_node_id: ownNodeId, branch_key: childBranchKey, outcome_logic: 'AND', label: '' },
                  ])
                }
              >
                + {childBranchKey === 'success' ? '成功' : '失敗'}時にネストを追加
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OverridesSection({ eventDefinitionId }) {
  const { data: roomTemplates } = useRoomTemplates();
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const { data: overrides } = useEventOverrides(selectedTemplateId || null);
  const { set, remove } = useEventOverrideMutations(selectedTemplateId || null);

  const currentOverride = overrides?.find((o) => o.event_definition_id === eventDefinitionId);

  return (
    <div style={{ ...rowStyle, background: '#fff8e6' }}>
      <p style={{ fontSize: 12, fontWeight: 500, margin: '0 0 8px' }}>部屋ごとの確率上書き（global scope向け）</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
          <option value="">部屋を選択</option>
          {(roomTemplates ?? []).map((rt) => (
            <option key={rt.id} value={rt.id}>
              {rt.name}
            </option>
          ))}
        </select>
        {selectedTemplateId && (
          <>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              placeholder="chance"
              defaultValue={currentOverride?.override_probability ?? ''}
              key={selectedTemplateId + (currentOverride?.override_probability ?? '')}
              onBlur={(e) => {
                if (e.target.value === '') return;
                set.mutate({ eventDefinitionId, overrideProbability: Number(e.target.value) });
              }}
            />
            {currentOverride && <button onClick={() => remove.mutate(eventDefinitionId)}>上書き解除</button>}
          </>
        )}
      </div>
    </div>
  );
}

export default function EventsPage() {
  const queryClient = useQueryClient();
  const { data: definitions, isLoading } = useEventDefinitions();
  const { data: characters } = useCharacters();
  const { data: axes } = useRelationshipAxes();
  const { data: expressionTypes } = useExpressionTypes();
  const { data: roomTemplates } = useRoomTemplates();
  const { data: items } = useAllItems();
  const { data: statuses } = useAllCharacterStatuses();
  const { data: worlds } = useWorlds();
  const { create, update, remove } = useEventDefinitionMutations();
  const { mobileListOpen, openList, closeList } = useMobileListToggle();

  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [selectedExportIds, setSelectedExportIds] = useState(new Set());

  useEffect(() => {
    if (selectedId === null) {
      setDraft(emptyEvent);
    } else {
      const found = definitions?.find((d) => d.id === selectedId);
      if (found) setDraft(found);
    }
  }, [selectedId, definitions]);

  if (isLoading || !draft || !characters || !axes || !expressionTypes || !worlds) return <p>読み込み中...</p>;

  function selectEvent(id) {
    setSelectedId(id);
    closeList();
  }

  async function handleSave() {
    if (!draft.name) return;
    if (draft.id) {
      await update.mutateAsync({ id: draft.id, data: draft });
    } else {
      const created = await create.mutateAsync(draft);
      setSelectedId(created.id);
    }
  }

  async function handleDelete() {
    if (!draft.id) return;
    if (!window.confirm('このイベントを削除しますか？')) return;
    await remove.mutateAsync(draft.id);
    setSelectedId(null);
  }

  async function handleExport() {
    if (!draft.id) return;
    const json = await eventsApi.export(draft.id);
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `event-${draft.name.replace(/[^\w-]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.name.toLowerCase().endsWith('.zip')) {
        const result = await contentBundleApi.import(file);
        window.alert(formatBundleImportSummary(result));
        queryClient.invalidateQueries({ queryKey: ['eventDefinitions'] });
        return;
      }
      const json = JSON.parse(await file.text());
      const result = await eventsApi.import(json);
      const warnings = [];
      if (result.unresolvedCharacters.length > 0) {
        warnings.push(`キャラクターが見つかりませんでした（未設定のまま）: ${result.unresolvedCharacters.join('、')}`);
      }
      if (!result.roomTemplateResolved) warnings.push('対象部屋が見つからなかったため、スコープをglobalに変更しました。');
      if (!result.prerequisiteResolved) warnings.push('前提イベントが見つからなかったため、前提設定を解除しました。');
      if (warnings.length > 0) window.alert(`インポートしました。\n\n${warnings.join('\n')}`);
      queryClient.invalidateQueries({ queryKey: ['eventDefinitions'] });
      setSelectedId(result.eventDefinition.id);
    } catch (err) {
      window.alert(`インポートに失敗しました: ${err.message}`);
    }
  }

  function toggleExportSelected(id) {
    setSelectedExportIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleExportSelected() {
    if (selectedExportIds.size === 0) return;
    await contentBundleApi.exportEventDefinitions([...selectedExportIds]);
  }

  const eventGroups = buildEventGroups(definitions ?? [], worlds);

  function renderEventCard(def) {
    return (
      <div
        key={def.id}
        onClick={() => selectEvent(def.id)}
        style={{
          cursor: 'pointer',
          display: 'flex',
          gap: 6,
          alignItems: 'flex-start',
          background: def.id === selectedId ? '#eef2ff' : '#f7f7f7',
          border: def.id === selectedId ? '1px solid #6366f1' : '1px solid #eee',
          borderRadius: 6,
          padding: '8px 10px',
          opacity: def.enabled ? 1 : 0.5,
          marginBottom: 8,
        }}
      >
        <input
          type="checkbox"
          checked={selectedExportIds.has(def.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleExportSelected(def.id)}
          style={{ marginTop: 3 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 4px' }}>{def.name}</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11, color: '#888' }}>
            <span>{def.scope}</span>
            <span>優先度 {def.priority}</span>
            {!def.enabled && <span>無効</span>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2>イベント定義</h2>
      <div className={`sidebar-layout${mobileListOpen ? ' mobile-list-open' : ''}`} style={{ '--sidebar-width': '220px' }}>
        <div className="sidebar-pane">
          <button
            style={{ width: '100%', marginBottom: 8 }}
            onClick={() => {
              setSelectedId(null);
              closeList();
            }}
          >
            + 新規イベント
          </button>
          <label style={{ display: 'block', width: '100%', marginBottom: 8 }}>
            <span style={{ display: 'block', width: '100%', textAlign: 'center', border: '1px solid #ddd', borderRadius: 6, padding: '4px 0', cursor: 'pointer', fontSize: 13 }}>
              インポート（JSON/zip）
            </span>
            <input type="file" accept="application/json,.json,.zip" style={{ display: 'none' }} onChange={handleImportFile} />
          </label>
          <button
            style={{ width: '100%', marginBottom: 12 }}
            disabled={selectedExportIds.size === 0}
            onClick={handleExportSelected}
          >
            選択したイベントをエクスポート（{selectedExportIds.size}件）
          </button>
          <GroupedList groups={eventGroups} storageKey="events" renderGroupItems={(group) => group.items.map(renderEventCard)} />
        </div>

        <div className="events-form" style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
          <button className="mobile-list-toggle" onClick={openList} style={{ marginBottom: 8 }}>
            ☰ 一覧を表示
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <input
              style={{ fontSize: 15, fontWeight: 500, maxWidth: 260 }}
              placeholder="イベント名"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#888' }}>
              <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
              有効
            </label>
          </div>

          <div style={{ ...grid3, marginBottom: 10 }}>
            <label>
              <span style={label11}>スコープ</span>
              <select value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value })}>
                <option value="global">global（全部屋共通）</option>
                <option value="room_template">room_template（特定の部屋のみ）</option>
              </select>
            </label>
            {draft.scope === 'room_template' && (
              <label>
                <span style={label11}>対象部屋</span>
                <select
                  value={draft.room_template_id ?? ''}
                  onChange={(e) => setDraft({ ...draft, room_template_id: Number(e.target.value) || null })}
                >
                  <option value="">選択してください</option>
                  {(roomTemplates ?? []).map((rt) => (
                    <option key={rt.id} value={rt.id}>
                      {rt.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <span style={label11}>条件の結合</span>
              <select value={draft.condition_logic} onChange={(e) => setDraft({ ...draft, condition_logic: e.target.value })}>
                <option value="AND">AND</option>
                <option value="OR">OR</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
            <label>
              <span style={label11}>優先度</span>
              <input type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} />
            </label>
            <label>
              <span style={label11}>クールダウン(ターン)</span>
              <input
                type="number"
                value={draft.cooldown_turns}
                onChange={(e) => setDraft({ ...draft, cooldown_turns: Number(e.target.value) })}
              />
            </label>
            <label>
              <span style={label11}>最大発火回数</span>
              <input
                type="number"
                placeholder="無制限"
                value={draft.max_fires_per_session ?? ''}
                onChange={(e) => setDraft({ ...draft, max_fires_per_session: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </label>
            <label>
              <span style={label11}>クールダウン／最大発火回数のリセット範囲</span>
              <select value={draft.reset_scope ?? 'playthrough'} onChange={(e) => setDraft({ ...draft, reset_scope: e.target.value })}>
                <option value="playthrough">ルート全体（従来通り）</option>
                <option value="session">部屋滞在（セッション）単位でリセット</option>
              </select>
            </label>
            <label>
              <span style={label11}>排他グループ</span>
              <input
                placeholder="なし"
                value={draft.exclusive_group ?? ''}
                onChange={(e) => setDraft({ ...draft, exclusive_group: e.target.value || null })}
              />
            </label>
          </div>

          <div style={{ borderTop: '1px solid #eee', paddingTop: 12, marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={draft.has_outcome_branch}
                onChange={(e) => setDraft({ ...draft, has_outcome_branch: e.target.checked })}
              />
              成功/失敗分岐を有効にする
            </label>
            {draft.has_outcome_branch && (
              <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                発火後、下の条件群で成功/失敗を判定し、アクションの「成功時のみ」「失敗時のみ」欄に応じて実行するアクションを絞り込みます。各条件群は成功/失敗どちらか一方へさらに最大{MAX_OUTCOME_NODE_DEPTH}段までネストできます。
              </p>
            )}
          </div>

          {draft.has_outcome_branch && (
            <div style={{ borderTop: '1px solid #eee', paddingTop: 12, marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 8px' }}>結果判定条件（条件群）</p>
              <ConditionGroupRow
                depth={0}
                ownNodeId={null}
                branchKey={null}
                label={draft.outcome_root_label}
                onLabelChange={(v) => setDraft({ ...draft, outcome_root_label: v })}
                outcomeLogic={draft.outcome_logic}
                onOutcomeLogicChange={(v) => setDraft({ ...draft, outcome_logic: v })}
                ownConditions={draft.conditions.filter((c) => (c.outcome_node_id ?? null) === null && c.phase === 'outcome')}
                conditions={draft.conditions}
                setConditions={(next) => setDraft({ ...draft, conditions: next })}
                outcomeNodes={draft.outcome_nodes}
                setOutcomeNodes={(next) => setDraft({ ...draft, outcome_nodes: next })}
                canDelete={false}
                characters={characters}
                axes={axes}
                items={items}
                statuses={statuses}
              />
              {flattenOutcomeNodes(draft.outcome_nodes).map(({ node, depth }) => (
                <ConditionGroupRow
                  key={node.id}
                  depth={depth}
                  ownNodeId={node.id}
                  branchKey={node.branch_key}
                  label={node.label}
                  onLabelChange={(v) =>
                    setDraft({ ...draft, outcome_nodes: draft.outcome_nodes.map((n) => (n.id === node.id ? { ...n, label: v } : n)) })
                  }
                  outcomeLogic={node.outcome_logic}
                  onOutcomeLogicChange={(v) =>
                    setDraft({
                      ...draft,
                      outcome_nodes: draft.outcome_nodes.map((n) => (n.id === node.id ? { ...n, outcome_logic: v } : n)),
                    })
                  }
                  ownConditions={draft.conditions.filter((c) => c.outcome_node_id === node.id)}
                  conditions={draft.conditions}
                  setConditions={(next) => setDraft({ ...draft, conditions: next })}
                  outcomeNodes={draft.outcome_nodes}
                  setOutcomeNodes={(next) => setDraft({ ...draft, outcome_nodes: next })}
                  canDelete
                  onDelete={() => {
                    const idsToRemove = collectNodeAndDescendantIds(draft.outcome_nodes, node.id);
                    setDraft({
                      ...draft,
                      outcome_nodes: draft.outcome_nodes.filter((n) => !idsToRemove.has(n.id)),
                      conditions: draft.conditions.filter((c) => !idsToRemove.has(c.outcome_node_id)),
                      actions: draft.actions.filter((a) => !idsToRemove.has(a.outcome_node_id)),
                    });
                  }}
                  characters={characters}
                  axes={axes}
                  items={items}
                  statuses={statuses}
                />
              ))}
            </div>
          )}

          <div style={{ borderTop: '1px solid #eee', paddingTop: 12, marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 8px' }}>前提イベント（連鎖）</p>
            <div style={grid3}>
              <label>
                <span style={label11}>前提イベント</span>
                <select
                  value={draft.prerequisite_event_definition_id ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, prerequisite_event_definition_id: e.target.value ? Number(e.target.value) : null })
                  }
                >
                  <option value="">なし</option>
                  {(definitions ?? [])
                    .filter((d) => d.id !== draft.id)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </label>
              {draft.prerequisite_event_definition_id != null && (
                <label>
                  <span style={label11}>前提イベントの結果条件</span>
                  <select
                    value={draft.requires_prerequisite_outcome}
                    onChange={(e) => setDraft({ ...draft, requires_prerequisite_outcome: e.target.value })}
                  >
                    <option value="any">問わない（発火済みであれば可）</option>
                    <option value="success">成功時のみ</option>
                    <option value="failure">失敗時のみ</option>
                  </select>
                </label>
              )}
              {draft.prerequisite_event_definition_id != null && (
                <label>
                  <span style={label11}>前提判定のリセット範囲</span>
                  <select
                    value={draft.prerequisite_reset_scope ?? 'playthrough'}
                    onChange={(e) => setDraft({ ...draft, prerequisite_reset_scope: e.target.value })}
                  >
                    <option value="playthrough">ルート全体で一度成立すれば継続（従来通り）</option>
                    <option value="session">同じ部屋滞在（セッション）内でのみ有効</option>
                  </select>
                </label>
              )}
            </div>
            {draft.prerequisite_event_definition_id != null && (
              <p style={{ fontSize: 11, color: '#888', margin: '8px 0 0' }}>
                前提イベントが（指定した結果条件を満たして）発火するまで、このイベントは発火対象になりません。「ルート全体」なら一度満たせばそのルート内でずっと有効、「部屋滞在単位」なら部屋を移動すると前提の成立状態はリセットされ、再度前提イベントを満たす必要があります。
              </p>
            )}
          </div>

          <div style={{ borderTop: '1px solid #eee', paddingTop: 12, marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 8px' }}>発火条件</p>
            {draft.conditions
              .filter((c) => (c.phase ?? 'trigger') === 'trigger')
              .map((condition, i) => (
                <ConditionEditor
                  key={i}
                  condition={condition}
                  characters={characters}
                  axes={axes}
                  items={items}
                  statuses={statuses}
                  hasOutcomeBranch={draft.has_outcome_branch}
                  fixedPhase="trigger"
                  onChange={(next) =>
                    setDraft({ ...draft, conditions: draft.conditions.map((c) => (c === condition ? next : c)) })
                  }
                  onRemove={() => setDraft({ ...draft, conditions: draft.conditions.filter((c) => c !== condition) })}
                />
              ))}
            <button
              onClick={() =>
                setDraft({
                  ...draft,
                  conditions: [
                    ...draft.conditions,
                    { condition_type: 'probability', params: conditionDefaults('probability'), phase: 'trigger' },
                  ],
                })
              }
            >
              + 条件を追加
            </button>
          </div>

          <div style={{ borderTop: '1px solid #eee', paddingTop: 12, marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 8px' }}>アクション</p>
            {draft.actions.map((action, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                  {draft.has_outcome_branch && (
                    <>
                      <span style={{ fontSize: 11, color: '#888' }}>紐づく条件群:</span>
                      <select
                        style={{ fontSize: 11, width: 'auto' }}
                        value={action.outcome_node_id == null ? 'root' : String(action.outcome_node_id)}
                        onChange={(e) => {
                          const v = e.target.value;
                          const nextNodeId = v === 'root' ? null : draft.outcome_nodes.find((n) => String(n.id) === v)?.id ?? null;
                          setDraft({
                            ...draft,
                            actions: draft.actions.map((a, idx) => (idx === i ? { ...a, outcome_node_id: nextNodeId } : a)),
                          });
                        }}
                      >
                        {listConditionGroupOptions(draft).map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <span style={{ fontSize: 11, color: '#aaa' }}>({describeActionBinding(action, draft)})</span>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
                    <button
                      disabled={i === 0}
                      onClick={() => {
                        const next = [...draft.actions];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        setDraft({ ...draft, actions: next });
                      }}
                    >
                      ↑
                    </button>
                    <button
                      disabled={i === draft.actions.length - 1}
                      onClick={() => {
                        const next = [...draft.actions];
                        [next[i + 1], next[i]] = [next[i], next[i + 1]];
                        setDraft({ ...draft, actions: next });
                      }}
                    >
                      ↓
                    </button>
                  </div>
                </div>
                <ActionEditor
                  action={action}
                  characters={characters}
                  axes={axes}
                  expressionTypes={expressionTypes}
                  items={items}
                  statuses={statuses}
                  hasOutcomeBranch={draft.has_outcome_branch}
                  onChange={(next) => setDraft({ ...draft, actions: draft.actions.map((a, idx) => (idx === i ? next : a)) })}
                  onRemove={() => setDraft({ ...draft, actions: draft.actions.filter((_, idx) => idx !== i) })}
                />
              </div>
            ))}
            <button
              onClick={() =>
                setDraft({
                  ...draft,
                  actions: [
                    ...draft.actions,
                    { action_type: 'insert_dialogue', params: actionDefaults('insert_dialogue'), outcome: 'always', outcome_node_id: null },
                  ],
                })
              }
            >
              + アクションを追加
            </button>
          </div>

          {draft.scope === 'global' && draft.id && <OverridesSection eventDefinitionId={draft.id} />}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, borderTop: '1px solid #eee', paddingTop: 14 }}>
            {draft.id && <button onClick={handleExport}>エクスポート</button>}
            {draft.id && <button onClick={handleDelete}>削除</button>}
            <button onClick={handleSave} disabled={!draft.name}>
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
