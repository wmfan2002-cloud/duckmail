CREATE TABLE IF NOT EXISTS archive_settings (
  key TEXT PRIMARY KEY,
  value JSONB NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS archive_settings_updated_at_idx ON archive_settings (updated_at DESC);

INSERT INTO archive_settings (key, value, updated_at)
VALUES (
  'sync_scheduler',
  '{"enabled": true, "intervalMinutes": 30, "maxQueue": 30, "processLimit": 20, "lastTriggeredAt": null}'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;
