CREATE TABLE IF NOT EXISTS mailboxes (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_enc TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'mail.tm',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mailboxes_is_active_idx ON mailboxes (is_active);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  mailbox_id BIGINT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  remote_id TEXT NOT NULL,
  subject TEXT NULL,
  from_address TEXT NULL,
  to_addresses JSONB NULL,
  received_at TIMESTAMPTZ NULL,
  snippet TEXT NULL,
  body_text TEXT NULL,
  body_html TEXT NULL,
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT messages_mailbox_id_remote_id_unique UNIQUE (mailbox_id, remote_id)
);

CREATE INDEX IF NOT EXISTS messages_mailbox_received_at_idx ON messages (mailbox_id, received_at DESC);
CREATE INDEX IF NOT EXISTS messages_from_address_idx ON messages (from_address);
CREATE INDEX IF NOT EXISTS messages_subject_idx ON messages (subject);

CREATE TABLE IF NOT EXISTS sync_runs (
  id BIGSERIAL PRIMARY KEY,
  mailbox_id BIGINT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  error_message TEXT NULL,
  stats JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sync_runs_mailbox_id_created_at_idx ON sync_runs (mailbox_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sync_runs_status_idx ON sync_runs (status);

CREATE TABLE IF NOT EXISTS sync_events (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  mailbox_id BIGINT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info',
  code TEXT NULL,
  message TEXT NOT NULL,
  payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sync_events_run_id_created_at_idx ON sync_events (run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sync_events_mailbox_id_created_at_idx ON sync_events (mailbox_id, created_at DESC);
