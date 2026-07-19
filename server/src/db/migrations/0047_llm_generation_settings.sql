-- Runtime LLM sampling parameters for generateChatCompletion (koboldClient.js),
-- separate from koboldcpp_launch_settings (which configures the exe launch
-- args, not per-request generation behavior). Repeated player input combined
-- with a weak/absent repetition penalty caused verbatim-repeated LLM output
-- across turns — exposing these lets the user tune anti-repetition strength
-- without a code change.
CREATE TABLE llm_generation_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  temperature REAL NOT NULL DEFAULT 0.8,
  rep_pen REAL NOT NULL DEFAULT 1.12,
  rep_pen_range INTEGER NOT NULL DEFAULT 2048,
  top_p REAL NOT NULL DEFAULT 0.92,
  top_k INTEGER NOT NULL DEFAULT 40,
  min_p REAL NOT NULL DEFAULT 0.05
);

INSERT INTO llm_generation_settings (id) VALUES (1);
