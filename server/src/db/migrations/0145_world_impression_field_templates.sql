-- World単位で「このWorldの全キャラに持たせる追加の印象フィールド」を
-- 複数登録できるテンプレート。character_impression_defaultsと同形だが
-- world_idスコープ。character_impression_defaultsに未登録のfield_keyを
-- 持つキャラは、そのキャラがこのWorldのプレイスルーで登場した時点で
-- 自動的にこのテンプレートの内容がキャラ側へ複製される
-- (ensureImpressionStatesSeeded拡張、characterImpressionStatesRepo.js)。
CREATE TABLE world_impression_field_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  default_value TEXT NOT NULL DEFAULT '',
  update_instruction TEXT NOT NULL DEFAULT ''
);

-- 印象フィールド自動更新(impressionAutoUpdate.js)にフィールドごとの
-- 更新指示を持たせる。テンプレートから複製された場合も著者が直接
-- キャラへ追加した場合も同じ列を使う。
ALTER TABLE character_impression_defaults ADD COLUMN update_instruction TEXT NOT NULL DEFAULT '';
