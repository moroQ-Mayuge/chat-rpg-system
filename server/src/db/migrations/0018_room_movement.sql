ALTER TABLE worlds ADD COLUMN movement_points_per_time_slot INTEGER NOT NULL DEFAULT 4;
ALTER TABLE room_templates ADD COLUMN is_place INTEGER NOT NULL DEFAULT 0;
ALTER TABLE playthroughs ADD COLUMN current_movement_subcount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE room_session_characters ADD COLUMN is_accompanying INTEGER NOT NULL DEFAULT 0;

CREATE TABLE room_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_room_template_id INTEGER NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  to_room_template_id INTEGER NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  movement_cost INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_room_connections_from ON room_connections(from_room_template_id);
