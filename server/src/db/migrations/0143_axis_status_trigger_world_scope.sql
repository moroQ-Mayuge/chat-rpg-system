-- axis_status_triggers をWorld固有にできるようにする。evaluateAxisStatusTriggers()
-- (axisStatusTriggersRepo.js) は関係性軸の値が閾値を超えたキャラ全員に対して、Worldを
-- 問わず無条件に発火していた。既存3件（依存度/欲情度→World4限定ステータス3種）は、
-- World4以外のキャラがその軸閾値を超えても同じWorld4限定ステータスを誤って付与して
-- しまう既存の潜在バグだったことが判明したため、ここで是正する。
--
-- world_id = NULL は「全World共通」（既存の character_statuses.world_id と同じ考え方）。
ALTER TABLE axis_status_triggers ADD COLUMN world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE;

-- 既存3件は調査済みの通り全てWorld4限定ステータス（依存気味/重度の依存/発情）を対象に
-- しているため、World4にスコープし直す。
UPDATE axis_status_triggers SET world_id = 4;
