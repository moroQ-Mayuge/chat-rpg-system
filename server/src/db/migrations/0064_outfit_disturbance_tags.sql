-- L3: 服が完全に脱げる前の「乱れ状態」(open/pull/lift/aside) を画像生成タグに
-- 反映する。suppresses_outfit_fields (0035) が「完全に隠す」を担うのに対し、
-- こちらは「フィールド自体は表示したまま、固定の乱れタグを追加する」担当。
-- 新しいテーブルは作らず、既存の脱衣ラダー（character_statusesのexclusive_group
-- による排他ステータス群）に2列追加するだけ -- 「シャツを開けた」状態は
-- 単に同じexclusive_group内の別の行（段階）として表現される。CHECK制約は付けない
-- （既存行への影響を避けるため、他のALTER列と同様アプリ側でバリデーションする）。
ALTER TABLE character_statuses ADD COLUMN disturbs_outfit_field TEXT NOT NULL DEFAULT '';
ALTER TABLE character_statuses ADD COLUMN disturbance_style TEXT NOT NULL DEFAULT '';

-- スタイル名(open/pull/lift/aside)ごとの固定danbooruタグ文言と、露出度から自動
-- 導出するタグ（topless/bottomless/completely_nude/breast_out）の固定文言。
-- どちらも衣装ごとではなくアプリ全体で1つずつ（image_prompt_display_settingsと
-- 同じシングルトン行パターン）。後者4つは実質そのまま実在のdanbooruタグ名なので
-- 妥当な既定値を入れておくが、編集可能にしておく（表記ゆれ対応のため）。
CREATE TABLE outfit_exposure_tag_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  open_tag TEXT NOT NULL DEFAULT '',
  pull_tag TEXT NOT NULL DEFAULT '',
  lift_tag TEXT NOT NULL DEFAULT '',
  aside_tag TEXT NOT NULL DEFAULT '',
  topless_tag TEXT NOT NULL DEFAULT 'topless',
  bottomless_tag TEXT NOT NULL DEFAULT 'bottomless',
  completely_nude_tag TEXT NOT NULL DEFAULT 'completely_nude',
  breast_out_tag TEXT NOT NULL DEFAULT 'breast_out'
);
INSERT INTO outfit_exposure_tag_settings (id) VALUES (1);
