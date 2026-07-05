// Shared serialize/parse module for the pipe/slash-delimited キャラ情報 format
// (SPEC.md 3.5). serialize() is used by promptBuilder.js for every LLM call.
// parse() (added in Phase 6) will be used by the LLM-assisted character
// generation and paste-import flows, sharing this same format definition.

function formatAge(character) {
  if (character.age_apparent && character.age_apparent !== character.age_real) {
    return `${character.age_real}(外見${character.age_apparent})`;
  }
  return character.age_real || '不明';
}

export function serializeCharacter(character, outfit) {
  const fields = [
    ['本名', character.full_name],
    ['あだ名', character.nickname],
    ['職業', character.occupation],
    [null, `年齢：${formatAge(character)}歳`],
    ['種族', character.race],
    ['属性', character.attribute],
    ['容姿特徴', character.appearance_features],
    ['目色形状', character.eye_description],
    ['髪型髪色', character.hair_description],
    ['体型', character.body_type],
    ['胸大きさ形', character.bust_description],
    ['身体特徴', character.physical_features],
    [null, `一人称自分呼方『${character.first_person}』`],
    [null, `あなたを『${character.call_user_as}』と呼ぶ`],
    [null, `他人を『${character.call_others_as}』と呼ぶ`],
    ['性格', character.personality],
    ['口調', character.speech_style],
    ['語尾', character.sentence_ending],
    ['行動原理', character.behavior_principle],
    ['対人傾向', character.social_tendency],
    ['癖口癖', character.habits],
    ['好物', character.likes],
    ['苦手', character.dislikes],
    ['服装', outfit?.clothing_description],
    ['装備', outfit?.equipment_description],
    ['スキル技能', character.skills],
    ['特殊スキル', character.special_skills],
    ['弱点', character.weakness],
    ['秘密', character.secret],
    ['備考', character.notes],
  ];

  const segments = fields.map(([label, value]) => (label ? `${label}：${value ?? ''}` : value));
  return `キャラ情報：${character.name}/${segments.join('/')}`;
}

const LABELED_FIELDS = [
  ['full_name', '本名'],
  ['nickname', 'あだ名'],
  ['occupation', '職業'],
  ['race', '種族'],
  ['attribute', '属性'],
  ['appearance_features', '容姿特徴'],
  ['eye_description', '目色形状'],
  ['hair_description', '髪型髪色'],
  ['body_type', '体型'],
  ['bust_description', '胸大きさ形'],
  ['physical_features', '身体特徴'],
  ['personality', '性格'],
  ['speech_style', '口調'],
  ['sentence_ending', '語尾'],
  ['behavior_principle', '行動原理'],
  ['social_tendency', '対人傾向'],
  ['habits', '癖口癖'],
  ['likes', '好物'],
  ['dislikes', '苦手'],
  ['skills', 'スキル技能'],
  ['special_skills', '特殊スキル'],
  ['weakness', '弱点'],
  ['secret', '秘密'],
  ['notes', '備考'],
];

const OUTFIT_LABELED_FIELDS = [
  ['clothing_description', '服装'],
  ['equipment_description', '装備'],
];

// Best-effort parser: never throws on missing/reordered/malformed segments
// (paste-import explicitly allows 表記ゆれ・項目欠落 per SPEC.md 3.5). Returns
// whatever it could match plus the leftover segments for the UI to surface.
//
// Small/quantized local models don't always follow the slash-delimited format
// exactly — they sometimes emit one field per line instead. Newlines are
// normalized to '/' before splitting so both styles parse the same way, and
// the 一人称/あなたを/他人を fields accept both the bracket『』 style and a
// plain "ラベル：値" style since models emit either.
export function parseCharacterSheet(rawText) {
  const fields = {};
  const outfitFields = {};
  const unmatchedSegments = [];

  let text = (rawText || '').trim();
  text = text.replace(/\r\n/g, '\n').replace(/\n+/g, '/');
  text = text.replace(/^キャラ情報[:：]\s*\/?/, '');

  const segments = text
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length > 0) {
    const first = segments.shift();
    const nameMatch = first.match(/^名前[:：]\s*(.*)$/);
    fields.name = nameMatch ? nameMatch[1].trim() : first;
  }

  for (const segment of segments) {
    let matched = false;
    let m;

    if (
      (m = segment.match(/^一人称(?:自分呼方)?[:：]?\s*『(.*)』$/)) ||
      (m = segment.match(/^一人称(?:自分呼方)?[:：]\s*(.*)$/))
    ) {
      fields.first_person = m[1].trim();
      matched = true;
    } else if (
      (m = segment.match(/^あなたを?[:：]?\s*『(.+?)』\s*と呼(?:ぶ|びます)?$/)) ||
      (m = segment.match(/^あなた?の?呼び方[:：]\s*(.+)$/)) ||
      (m = segment.match(/^あなたを[:：]\s*(.+?)\s*と呼(?:ぶ|びます)$/)) ||
      (m = segment.match(/^あなたを[:：]\s*(.+)$/))
    ) {
      fields.call_user_as = m[1].trim();
      matched = true;
    } else if (
      (m = segment.match(/^他人を?[:：]?\s*『(.+?)』\s*と呼(?:ぶ|びます)?$/)) ||
      (m = segment.match(/^他人の?呼び方[:：]\s*(.+)$/)) ||
      (m = segment.match(/^他人を[:：]\s*(.+?)\s*と呼(?:ぶ|びます)$/)) ||
      (m = segment.match(/^他人を[:：]\s*(.+)$/))
    ) {
      fields.call_others_as = m[1].trim();
      matched = true;
    } else if ((m = segment.match(/^年齢[:：](.*)歳$/))) {
      const ageMatch = m[1].match(/^(.*)\(外見(.*)\)$/);
      if (ageMatch) {
        fields.age_real = ageMatch[1];
        fields.age_apparent = ageMatch[2];
      } else {
        fields.age_real = m[1];
        fields.age_apparent = '';
      }
      matched = true;
    }

    if (!matched) {
      for (const [key, label] of LABELED_FIELDS) {
        if ((m = segment.match(new RegExp(`^${label}[:：](.*)$`)))) {
          fields[key] = m[1];
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      for (const [key, label] of OUTFIT_LABELED_FIELDS) {
        if ((m = segment.match(new RegExp(`^${label}[:：](.*)$`)))) {
          outfitFields[key] = m[1];
          matched = true;
          break;
        }
      }
    }

    if (!matched) unmatchedSegments.push(segment);
  }

  return { fields, outfitFields, unmatchedSegments };
}
