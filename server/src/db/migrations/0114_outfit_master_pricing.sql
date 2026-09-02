-- 衣装マスタ44件中30件がbuy_price/sell_price未設定(=購入不可)で入手手段が
-- 無いままだった。全衣装に一律の既定価格を補完し、既に個別価格が設定済みの
-- 行はそのまま(COALESCEで既存値優先)。
UPDATE outfit_masters SET buy_price = COALESCE(buy_price, 10000);
UPDATE outfit_masters SET sell_price = COALESCE(sell_price, 500);

-- 価格が付いていても購入・入手経路（買い物/拾える部屋どちらからも）から
-- 除外したい衣装（イベント専用の特別な一着など）向けの明示フラグ。
ALTER TABLE outfit_masters ADD COLUMN is_not_for_sale INTEGER NOT NULL DEFAULT 0;
