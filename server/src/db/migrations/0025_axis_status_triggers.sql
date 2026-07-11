CREATE TABLE axis_status_triggers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relationship_axis_id INTEGER NOT NULL REFERENCES relationship_axes(id) ON DELETE CASCADE,
  comparison TEXT NOT NULL CHECK (comparison IN ('>=', '<=', '==', '>', '<')),
  threshold_value INTEGER NOT NULL,
  status_id INTEGER NOT NULL REFERENCES character_statuses(id) ON DELETE CASCADE
);
