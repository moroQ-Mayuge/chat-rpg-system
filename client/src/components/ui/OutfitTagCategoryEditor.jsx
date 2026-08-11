import DanbooruTagEditor from './DanbooruTagEditor.jsx';

// Matches server/src/db/repositories/outfitsRepo.js's OUTFIT_TAG_FIELDS order.
// Shared by CharactersPage.jsx (per-character outfit instances) and
// OutfitMastersPage.jsx (PLAN_2026-08-02_outfit_spec_revision.md 実装順3) --
// both edit the same 19 danbooru-tag columns, so this UI block moved here
// instead of being duplicated across the two pages.
export const OUTFIT_TAG_CATEGORIES = [
  ['main_features', '主たる特徴（髪型以外の目の色・体形・キャラタグなど）※空欄ならキャラ本体の値を使用'],
  ['hairstyle', '髪型※空欄ならキャラ本体の値を使用'],
  ['clothing_main', '服装の主たる特徴（学校制服など）'],
  ['clothing_face', '服装：顔回り（帽子・耳アクセサリなど）'],
  ['clothing_upper', '中衣（ベース）：上半身（シャツ・ジャケットなど）'],
  ['clothing_lower', '中衣（ベース）：下半身（スカートなど、太もも上部まで）'],
  ['clothing_legs', '足回り（太ももからふくらはぎ）'],
  ['shoes', '靴'],
  ['clothing_face_outer', '上着・重ね着：顔回り（マフラーなど）'],
  ['clothing_upper_outer', '上着（アウター）：上半身（ジャケット・コートなど）'],
  ['clothing_lower_outer', '上着（アウター）：下半身'],
  ['clothing_legs_outer', '上着・重ね着：足回り'],
  ['clothing_face_equipment', '追加装備：顔回り（兜など、普段着でないもの）'],
  ['clothing_upper_equipment', '追加装備：上半身（鎧など、普段着でないもの）'],
  ['clothing_lower_equipment', '追加装備：下半身（鎧など、普段着でないもの）'],
  ['clothing_legs_equipment', '追加装備：足回り（鎧など、普段着でないもの）'],
  ['underwear_upper', '下着：上半身'],
  ['underwear_lower', '下着：下半身（水着含む）'],
  ['belongings', '持ち物（かばん・武器など）'],
];
export const OUTFIT_TAG_FIELDS = OUTFIT_TAG_CATEGORIES.map(([key]) => key);

// The 6 fields the undress-state ladder tracks (undressState.js) -- the only
// ones where a "disturbance style" ever makes sense. Matches
// server/src/services/outfitTagCategories.js's garment_operations gating.
export const DISTURBABLE_FIELDS = ['clothing_upper_outer', 'clothing_upper', 'clothing_lower_outer', 'clothing_lower', 'underwear_upper', 'underwear_lower'];

const DISTURBANCE_STYLES = [
  ['open', '開く'],
  ['pull', 'ずらす'],
  ['lift', 'たくし上げる'],
  ['aside', '横にずらす'],
];

// values: an object holding the 19 OUTFIT_TAG_FIELDS columns (an outfit
// instance or an outfit master row both have this shape).
// onFieldChange(key, value) / onGarmentOperationChange(key, style, checked):
// same signatures as CharactersPage.jsx's updateActiveOutfitField/
// updateGarmentOperation, so callers can pass those functions directly.
// showIconToggle/iconExcludedFields/onToggleIconField: per-Outfit "include in
// generated EXPRESSION icon" checkbox (0098) -- expression icons are often
// close-ups where belongings/shoes/etc. don't matter. Only CharactersPage.jsx
// passes these (OutfitMastersPage.jsx has no expression-icon generation of
// its own, so the checkbox stays hidden there). Only shown for a category
// that actually has a value, per the request this was built for.
export default function OutfitTagCategoryEditor({
  values,
  onFieldChange,
  garmentOperations,
  onGarmentOperationChange,
  showIconToggle = false,
  iconExcludedFields = [],
  onToggleIconField,
}) {
  return (
    <div>
      <p style={{ fontSize: 12, marginBottom: 4 }}>画像生成用danbooruタグ（カテゴリ別）</p>
      {OUTFIT_TAG_CATEGORIES.map(([key, label]) => (
        <details key={key} open={Boolean(values[key]?.trim())} style={{ marginBottom: 4 }}>
          <summary style={{ fontSize: 11, color: '#555', cursor: 'pointer' }}>{label}</summary>
          {showIconToggle && Boolean(values[key]?.trim()) && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, margin: '4px 0' }}>
              <input
                type="checkbox"
                checked={!iconExcludedFields.includes(key)}
                onChange={(e) => onToggleIconField(key, !e.target.checked)}
              />
              表情アイコンに含める
            </label>
          )}
          {DISTURBABLE_FIELDS.includes(key) && (
            <p style={{ fontSize: 10, color: '#999', margin: '4px 0' }}>
              先頭のタグは主たる構造語として扱われます（例：shirt）。乱れ操作時にこの語だけが書き換わります。
            </p>
          )}
          <DanbooruTagEditor value={values[key]} onChange={(v) => onFieldChange(key, v)} />
          {DISTURBABLE_FIELDS.includes(key) && (
            <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
              {DISTURBANCE_STYLES.map(([style, styleLabel]) => (
                <label key={style} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
                  <input
                    type="checkbox"
                    checked={(garmentOperations?.[key] ?? []).includes(style)}
                    onChange={(e) => onGarmentOperationChange(key, style, e.target.checked)}
                  />
                  {styleLabel}
                </label>
              ))}
            </div>
          )}
        </details>
      ))}
    </div>
  );
}
