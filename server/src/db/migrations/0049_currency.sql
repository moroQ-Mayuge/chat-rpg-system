-- Currency: opt-in per World (some settings shouldn't have money at all),
-- with a configurable unit label (円/G/ペリカ etc). Items get buy/sell prices
-- (NULL = not for sale / can't be sold). Rooms flagged is_shop require
-- payment on ITEM_GRANT instead of the usual free hand-over. playthroughs
-- tracks the running balance, seeded from the World's initial_money.
ALTER TABLE worlds ADD COLUMN currency_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE worlds ADD COLUMN currency_unit TEXT NOT NULL DEFAULT '円';
ALTER TABLE worlds ADD COLUMN initial_money INTEGER NOT NULL DEFAULT 0;

ALTER TABLE items ADD COLUMN buy_price INTEGER;
ALTER TABLE items ADD COLUMN sell_price INTEGER;

ALTER TABLE room_templates ADD COLUMN is_shop INTEGER NOT NULL DEFAULT 0;

ALTER TABLE playthroughs ADD COLUMN money INTEGER NOT NULL DEFAULT 0;
