-- Inbrix v1 schema. Idempotent — safe to run on every boot.

-- Single-row table holding the bot's whole runtime state. A CHECK(id = 1)
-- constraint keeps it physically impossible to ever have a second row.
CREATE TABLE IF NOT EXISTS bot_state (
  id                 SMALLINT PRIMARY KEY DEFAULT 1,
  paused             BOOLEAN NOT NULL DEFAULT false,
  history_id         TEXT,
  watch_expiration   TIMESTAMPTZ,
  last_poll_at       TIMESTAMPTZ,
  last_poll_error    TEXT,
  last_push_at       TIMESTAMPTZ,
  last_push_error    TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO bot_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Authoritative dedupe guard. Poll and push race to insert the same Gmail
-- message id; whichever wins the unique-key insert is the one that actually
-- forwards it. No advisory lock needed for correctness — this is enough.
CREATE TABLE IF NOT EXISTS processed_messages (
  message_id          TEXT PRIMARY KEY,
  thread_id            TEXT,
  source                TEXT NOT NULL,          -- 'poll' | 'push'
  telegram_chat_id      BIGINT,
  telegram_message_id  BIGINT,
  forwarded_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_processed_messages_forwarded_at
  ON processed_messages (forwarded_at DESC);

-- "Ignore Sender" list. Checked before forwarding, and consulted (best
-- effort) after too, so a tap on an already-in-flight message still works.
CREATE TABLE IF NOT EXISTS blocked_senders (
  email       TEXT PRIMARY KEY,
  blocked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Watchdog alert history — used purely to throttle repeat alerts for the
-- same ongoing issue rather than paging you every 5 minutes for one outage.
CREATE TABLE IF NOT EXISTS watchdog_alerts (
  id          SERIAL PRIMARY KEY,
  kind        TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_watchdog_alerts_kind_created
  ON watchdog_alerts (kind, created_at DESC);
