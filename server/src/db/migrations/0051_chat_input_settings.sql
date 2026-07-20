-- Single-row settings table (same shape as llm_generation_settings /
-- status_display_preferences) controlling whether @mention tokens are kept
-- in the chat input after a send, or cleared along with the rest of the
-- draft. Default 0 (keep) per user decision -- the previous unconditional
-- full-clear is now the opt-in "1" behavior.
CREATE TABLE chat_input_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  clear_mentions_on_send INTEGER NOT NULL DEFAULT 0
);

INSERT INTO chat_input_settings (id) VALUES (1);
