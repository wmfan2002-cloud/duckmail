CREATE INDEX IF NOT EXISTS messages_search_fts_idx
  ON messages
  USING GIN (to_tsvector('simple', coalesce(subject, '') || ' ' || coalesce(snippet, '') || ' ' || coalesce(body_text, '')));

CREATE INDEX IF NOT EXISTS messages_received_ttl_idx ON messages (received_at);

CREATE INDEX IF NOT EXISTS sync_runs_started_finished_idx ON sync_runs (started_at, finished_at);
CREATE INDEX IF NOT EXISTS sync_runs_failed_created_idx ON sync_runs (created_at DESC) WHERE status = 'failed';
