-- Room-master level: candidate item CATEGORIES a room can yield when the
-- player investigates its surroundings (@周辺 mention). Mirrors
-- room_template_prop_categories exactly, but for items instead of props --
-- items have no equivalent "which categories are findable here" concept yet.
CREATE TABLE room_template_item_categories (
  room_template_id INTEGER NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  item_category_id INTEGER NOT NULL REFERENCES item_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (room_template_id, item_category_id)
);
