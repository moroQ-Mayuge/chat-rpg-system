import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEventDefinitions, useEventDefinitionMutations, useEventOverrides, useEventOverrideMutations } from '../hooks/useEvents.js';
import { useCharacters } from '../hooks/useCharacters.js';
import { useRelationshipAxes } from '../hooks/useRelationshipAxes.js';
import { useExpressionTypes } from '../hooks/useExpressionTypes.js';
import { useRoomTemplates } from '../hooks/useRoomTemplates.js';
import { useAllItems } from '../hooks/useItems.js';
import { eventsApi } from '../api/events.js';

const CONDITION_TYPES = [
  { value: 'probability', label: '確率' },
  { value: 'turn_count', label: '経過ターン数' },
  { value: 'keyword', label: 'キーワード検出' },
  { value: 'relationship_threshold', label: '関係性閾値' },
  { value: 'flag_state', label: 'フラグ状態' },
  { value: 'participant_count', label: '同席人数' },
  { value: 'has_item', label: '所持アイテム' },
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
  { value: 'remove_item', label: 'アイテム削除' },
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
      return { selection_mode: 'specific', character_id: null, candidate_character_ids: [], outfit_id: null, entrance_narration: '' };
    case 'character_leave':
      return { selection_mode: 'specific', character_id: null, exit_narration: '' };
    case 'generate_image':
      return { image_type: 'event', prompt_override: '', target_character_ids: [] };
    case 'set_flag':
      return { flag_key: '', operation: 'set', value: '' };
    case 'change_relationship':
      return { character_id: null, axis_id: null, operation: 'add', value: 5 };
    case 'change_outfit':
      return { character_id: null, outfit_id: null };
    case 'advance_time':
      return { slots: 1 };
    case 'grant_item':
    case 'remove_item':
      return { item_id: null, quantity: 1 };
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
  has_outcome_branch: false,
  outcome_logic: 'AND',
  prerequisite_event_definition_id: null,
  requires_prerequisite_outcome: 'any',
  conditions: [],
  actions: [],
};

const rowStyle = { background: '#f7f7f7', border: '1px solid #eee', borderRadius: 6, padding: 10, marginBottom: 8 };
const rowHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 };
const grid3 = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 };
const label11 = { fontSize: 11, color: '#888', display: 'block', marginBottom: 2 };

function ConditionEditor({ condition, characters, axes, items, hasOutcomeBranch, onChange, onRemove }) {
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
            onChange={(e) => onChange({ condition_type: e.target.value, params: conditionDefaults(e.target.value) })}
          >
            {CONDITION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {hasOutcomeBranch && (
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
              onChange={(e) => setParams({ character_id: e.target.value === 'any_present' ? 'any_present' : Number(e.target.value) || null })}
            >
              <option value="">選択してください</option>
              <option value="any_present">同席者の誰か1人でも</option>
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

function ActionEditor({ action, characters, axes, expressionTypes, items, hasOutcomeBranch, onChange, onRemove }) {
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
          <select value={action.action_type} onChange={(e) => onChange({ action_type: e.target.value, params: actionDefaults(e.target.value) })}>
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
                onChange={(e) => setParams({ character_id: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">ナレーション</option>
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
            <input
              style={{ width: '100%', marginTop: 8 }}
              placeholder="固定の台詞・ナレーション文"
              value={p.text ?? ''}
              onChange={(e) => setParams({ text: e.target.value })}
            />
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
                <select value={p.character_id ?? ''} onChange={(e) => setParams({ character_id: Number(e.target.value) || null })}>
                  <option value="">選択してください</option>
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
                <select value={p.character_id ?? ''} onChange={(e) => setParams({ character_id: Number(e.target.value) || null })}>
                  <option value="">選択してください</option>
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
              <span style={label11}>対象キャラ（複数選択・未選択は同席者全員）</span>
              <select
                multiple
                value={(p.target_character_ids ?? []).map(String)}
                onChange={(e) => setParams({ target_character_ids: Array.from(e.target.selectedOptions, (o) => Number(o.value)) })}
              >
                {charOptions}
              </select>
            </label>
          </div>
          <textarea
            style={{ width: '100%', marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}
            rows={2}
            placeholder="${みお}, blush, on top of, ${target1}, lying down"
            value={p.prompt_override ?? ''}
            onChange={(e) => setParams({ prompt_override: e.target.value })}
          />
          <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
            ${'{キャラ名}'} で固定のキャラを、${'{target1}'} ${'{target2}'} …で「対象キャラ」欄で選んだ順番のキャラを、それぞれ現在衣装のdanbooruタグに置換します（対象キャラ未選択時は同席者全員の順）。具体的な性的表現の内容はここで自由入力してください。
          </p>
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
        </div>
      )}

      {action.action_type === 'change_relationship' && (
        <div style={grid3}>
          <label>
            <span style={label11}>対象キャラ</span>
            <select
              value={p.character_id ?? ''}
              onChange={(e) => setParams({ character_id: e.target.value === 'all_present' ? 'all_present' : Number(e.target.value) || null })}
            >
              <option value="">選択してください</option>
              <option value="all_present">同席者全員</option>
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
        </div>
      )}

      {action.action_type === 'change_outfit' && (
        <div style={grid3}>
          <label>
            <span style={label11}>対象キャラ</span>
            <select value={p.character_id ?? ''} onChange={(e) => setParams({ character_id: Number(e.target.value) || null })}>
              <option value="">選択してください</option>
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
  const { create, update, remove } = useEventDefinitionMutations();

  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    if (selectedId === null) {
      setDraft(emptyEvent);
    } else {
      const found = definitions?.find((d) => d.id === selectedId);
      if (found) setDraft(found);
    }
  }, [selectedId, definitions]);

  if (isLoading || !draft || !characters || !axes || !expressionTypes) return <p>読み込み中...</p>;

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

  return (
    <div>
      <h2>イベント定義</h2>
      <div className="sidebar-layout" style={{ '--sidebar-width': '220px' }}>
        <div>
          <button style={{ width: '100%', marginBottom: 8 }} onClick={() => setSelectedId(null)}>
            + 新規イベント
          </button>
          <label style={{ display: 'block', width: '100%', marginBottom: 12 }}>
            <span style={{ display: 'block', width: '100%', textAlign: 'center', border: '1px solid #ddd', borderRadius: 6, padding: '4px 0', cursor: 'pointer', fontSize: 13 }}>
              インポート
            </span>
            <input type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImportFile} />
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(definitions ?? []).map((def) => (
              <div
                key={def.id}
                onClick={() => setSelectedId(def.id)}
                style={{
                  cursor: 'pointer',
                  background: def.id === selectedId ? '#eef2ff' : '#f7f7f7',
                  border: def.id === selectedId ? '1px solid #6366f1' : '1px solid #eee',
                  borderRadius: 6,
                  padding: '8px 10px',
                  opacity: def.enabled ? 1 : 0.5,
                }}
              >
                <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 4px' }}>{def.name}</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11, color: '#888' }}>
                  <span>{def.scope}</span>
                  <span>優先度 {def.priority}</span>
                  {!def.enabled && <span>無効</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="events-form" style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
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
              <span style={label11}>排他グループ</span>
              <input
                placeholder="なし"
                value={draft.exclusive_group ?? ''}
                onChange={(e) => setDraft({ ...draft, exclusive_group: e.target.value || null })}
              />
            </label>
          </div>

          <div style={{ borderTop: '1px solid #eee', paddingTop: 12, marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: draft.has_outcome_branch ? 8 : 0 }}>
              <input
                type="checkbox"
                checked={draft.has_outcome_branch}
                onChange={(e) => setDraft({ ...draft, has_outcome_branch: e.target.checked })}
              />
              成功/失敗分岐を有効にする
            </label>
            {draft.has_outcome_branch && (
              <>
                <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
                  発火後、条件の「結果判定条件」欄に振り分けたものだけで成功/失敗を判定し、アクションの「成功時のみ」「失敗時のみ」欄に応じて実行するアクションを絞り込みます。
                </p>
                <label>
                  <span style={label11}>結果判定条件の結合</span>
                  <select value={draft.outcome_logic} onChange={(e) => setDraft({ ...draft, outcome_logic: e.target.value })}>
                    <option value="AND">AND</option>
                    <option value="OR">OR</option>
                  </select>
                </label>
              </>
            )}
          </div>

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
            </div>
            {draft.prerequisite_event_definition_id != null && (
              <p style={{ fontSize: 11, color: '#888', margin: '8px 0 0' }}>
                前提イベントがこのルート内で（指定した結果条件を満たして）発火するまで、このイベントは発火対象になりません。
              </p>
            )}
          </div>

          <div style={{ borderTop: '1px solid #eee', paddingTop: 12, marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 8px' }}>条件</p>
            {draft.conditions.map((condition, i) => (
              <ConditionEditor
                key={i}
                condition={condition}
                characters={characters}
                axes={axes}
                items={items}
                hasOutcomeBranch={draft.has_outcome_branch}
                onChange={(next) =>
                  setDraft({ ...draft, conditions: draft.conditions.map((c, idx) => (idx === i ? next : c)) })
                }
                onRemove={() => setDraft({ ...draft, conditions: draft.conditions.filter((_, idx) => idx !== i) })}
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
              <ActionEditor
                key={i}
                action={action}
                characters={characters}
                axes={axes}
                expressionTypes={expressionTypes}
                items={items}
                hasOutcomeBranch={draft.has_outcome_branch}
                onChange={(next) => setDraft({ ...draft, actions: draft.actions.map((a, idx) => (idx === i ? next : a)) })}
                onRemove={() => setDraft({ ...draft, actions: draft.actions.filter((_, idx) => idx !== i) })}
              />
            ))}
            <button
              onClick={() =>
                setDraft({
                  ...draft,
                  actions: [
                    ...draft.actions,
                    { action_type: 'insert_dialogue', params: actionDefaults('insert_dialogue'), outcome: 'always' },
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
