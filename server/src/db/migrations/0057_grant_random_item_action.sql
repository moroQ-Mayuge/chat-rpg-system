-- New event action grant_random_item: weighted-random pick from a pool of
-- items, for "use an item to probabilistically obtain another item" content
-- (e.g. fishing with a rod at a river/sea room). Reuses the same weighted-pick
-- algorithm already used for character-slot selection
-- (worldRoomSlotAssignmentsRepo.js's pickWeighted / characterJoin.js) but for
-- items -- grant_item only supports a single fixed item_id, with no way to
-- vary the outcome. CHECK constraint rebuild, same procedure as 0050.
CREATE TABLE event_actions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (
    action_type IN (
      'character_join', 'character_leave', 'insert_dialogue', 'generate_image', 'set_flag',
      'change_relationship', 'change_outfit', 'advance_time', 'grant_item', 'remove_item',
      'change_status', 'set_address', 'spend_money', 'set_scene_situation', 'grant_random_item'
    )
  ),
  params TEXT NOT NULL DEFAULT '{}',
  outcome TEXT NOT NULL DEFAULT 'always' CHECK (outcome IN ('always', 'success', 'failure'))
);
INSERT INTO event_actions_new (id, event_definition_id, action_type, params, outcome)
  SELECT id, event_definition_id, action_type, params, outcome FROM event_actions;
DROP TABLE event_actions;
ALTER TABLE event_actions_new RENAME TO event_actions;
