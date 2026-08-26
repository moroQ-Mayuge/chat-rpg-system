import { generateChatCompletion } from './koboldClient.js';
import { parseCharacterSheet } from './characterSheetFormat.js';
import { resolveJapaneseGrammar } from '../db/repositories/llmGenerationSettingsRepo.js';

const SHEET_FORMAT_TEMPLATE =
  'キャラ情報：{名前}/本名：{本名}/あだ名：{あだ名}/職業：{職業}/年齢：{年齢}歳/種族：{種族}/属性：{属性}/容姿特徴：{容姿特徴}/目色形状：{目色形状}/髪型髪色：{髪型髪色}/体型：{体型}/胸大きさ形：{胸}/身体特徴：{身体特徴}/一人称自分呼方『{一人称}』/あなたを『{呼称}』と呼ぶ/他人を『{他人呼称}』と呼ぶ/性格：{性格}/口調：{口調}/語尾：{語尾}/行動原理：{行動原理}/対人傾向：{対人傾向}/癖口癖：{癖}/好物：{好物}/苦手：{苦手}/スキル技能：{スキル}/特殊スキル：{特殊スキル}/弱点：{弱点}/秘密：{秘密}/備考：{備考}';

const SHEET_FORMAT_EXAMPLE =
  'キャラ情報：みお/本名：桜井美桜（さくらいみお）/あだ名：みおりん/職業：高校2年生/年齢：17歳/種族：人間/属性：なし/容姿特徴：童顔、たれ目/目色形状：大きな茶色の瞳/髪型髪色：肩までのミディアムヘア、黒髪/体型：小柄で華奢/胸大きさ形：普通/身体特徴：色白/一人称自分呼方『わたし』/あなたを『先輩』と呼ぶ/他人を『くん・さん』と呼ぶ/性格：人懐っこいが芯は強い/口調：丁寧だが親しみやすい/語尾：〜です、〜だよ/行動原理：大切な人を守るため/対人傾向：面倒見が良い/癖口癖：照れると早口になる/好物：甘いもの/苦手：虫/スキル技能：料理/特殊スキル：なし/弱点：押しに弱い/秘密：実は特殊な力を持つ/備考：なし';

// Full-sheet LLM auto-generation (SPEC.md 3.5 "LLM自動生成モード"). Returns
// parsed fields only — never auto-saves, the caller (character edit form)
// reviews/edits before persisting.
export async function generateCharacterSheet(instruction) {
  const systemPrompt = [
    'あなたはキャラクター設定を1件作成するアシスタントです。',
    '以下のフォーマットに厳密に従い、指定された作成指示を踏まえたキャラクターシートを1つだけ出力してください。',
    '必ず改行を使わず、区切り文字「/」で全項目をつなげた1行だけを出力してください。',
    '説明文や前置き、フォーマット外のテキストは一切書かないでください。',
    '',
    `フォーマット：\n${SHEET_FORMAT_TEMPLATE}`,
    '',
    `出力例：\n${SHEET_FORMAT_EXAMPLE}`,
  ].join('\n');

  const rawText = await generateChatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `作成指示：${instruction}` },
    ],
    maxTokens: 700,
    temperature: 0.9,
    grammar: resolveJapaneseGrammar(),
  });

  const parsed = parseCharacterSheet(rawText);
  const suggestedTags = await suggestDanbooruTags(parsed.fields);
  return { ...parsed, suggestedTags, rawText };
}

// Paste-import parsing (SPEC.md 3.5 "フォーマット貼り付け登録モード"). The
// pasted text never contains danbooru tags, so those are requested separately.
export async function parseAndSuggestTags(rawText) {
  const parsed = parseCharacterSheet(rawText);
  const suggestedTags = await suggestDanbooruTags(parsed.fields);
  return { ...parsed, suggestedTags };
}

// Converts appearance-related fields into a danbooru tag list (comma-separated),
// used as the "一次案" the user reviews via the tag-chip UI (SPEC.md 3.5).
export async function suggestDanbooruTags(fields) {
  const appearanceText = [
    fields.appearance_features,
    fields.eye_description,
    fields.hair_description,
    fields.body_type,
    fields.bust_description,
    fields.physical_features,
  ]
    .filter(Boolean)
    .join('、');

  if (!appearanceText) return [];

  const systemPrompt = [
    '以下の日本語の容姿説明を、画像生成に使うdanbooruタグに変換してください。',
    '出力は半角カンマ区切りの英単語タグのみとし、日本語・説明文・見出し・表・箇条書き記号は一切含めないでください。',
    '出力形式の例：long_hair, blue_eyes, tareme, school_uniform, slim',
  ].join('\n');

  const rawText = await generateChatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: appearanceText },
    ],
    maxTokens: 200,
    temperature: 0.5,
  });

  return rawText
    .split(',')
    .map((t) => t.trim().replace(/\.$/, ''))
    // Drop anything that isn't a plausible bare danbooru tag: small quantized
    // models sometimes ignore the "tags only" instruction and emit Japanese
    // commentary or markdown-table fragments mixed in with real tags.
    .filter((t) => t && /^[a-zA-Z0-9_():.\s-]+$/.test(t) && t.length <= 40);
}

const FIELD_LABELS = {
  name: '名前（愛称）',
  full_name: '本名',
  nickname: 'あだ名',
  occupation: '職業',
  age_real: '実年齢',
  age_apparent: '外見年齢',
  race: '種族',
  attribute: '属性',
  appearance_features: '容姿特徴',
  eye_description: '目色形状',
  hair_description: '髪型髪色',
  body_type: '体型',
  bust_description: '胸大きさ形',
  physical_features: '身体特徴',
  first_person: '一人称',
  call_user_as: 'あなたの呼び方',
  call_others_as: '他人の呼び方',
  personality: '性格',
  speech_style: '口調',
  sentence_ending: '語尾',
  behavior_principle: '行動原理',
  social_tendency: '対人傾向',
  habits: '癖口癖',
  likes: '好物',
  dislikes: '苦手',
  skills: 'スキル技能',
  special_skills: '特殊スキル',
  weakness: '弱点',
  secret: '秘密',
  notes: '備考',
};

// Regenerates a single field only (SPEC.md 3.5 "フィールド単位のLLM再生成"),
// using the creation instruction plus the currently-filled-in other fields as
// context so the reroll stays consistent with the rest of the sheet.
export async function regenerateField({ field, instruction, currentFields }) {
  const label = FIELD_LABELS[field];
  if (!label) throw new Error(`unknown field: ${field}`);

  const contextLines = Object.entries(currentFields)
    .filter(([key, value]) => key !== field && value)
    .map(([key, value]) => `${FIELD_LABELS[key] ?? key}：${value}`)
    .join('\n');

  const systemPrompt = [
    'あなたはキャラクター設定の一項目だけを考えるアシスタントです。',
    '作成指示と、すでに決まっている他の設定を踏まえて、指定された項目の内容だけを出力してください。',
    '項目名やラベル、説明文は含めず、値のみを1行で出力してください。',
  ].join('\n');

  const userPrompt = [`作成指示：${instruction || '(指定なし)'}`, '', '現在の設定：', contextLines, '', `生成する項目：${label}`].join(
    '\n',
  );

  const rawText = await generateChatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    maxTokens: 150,
    temperature: 0.9,
    grammar: resolveJapaneseGrammar(),
  });

  return rawText.trim().split('\n')[0];
}
