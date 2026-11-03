ALTER TABLE demo_evaluation_responses ADD COLUMN IF NOT EXISTS workflow_stage TEXT
  CHECK (workflow_stage IN ('filling','review','acknowledgment','completed'));

CREATE TABLE IF NOT EXISTS demo_evaluation_attachments (
  id BIGSERIAL PRIMARY KEY,
  evaluation_id TEXT NOT NULL REFERENCES demo_evaluation_responses(evaluation_id),
  filename TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('application/pdf','text/plain; charset=utf-8')),
  content BYTEA NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 2097152),
  actor TEXT NOT NULL CHECK (actor IN ('servidor','rh')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evaluation_attachments_parent ON demo_evaluation_attachments(evaluation_id,id);

CREATE TABLE IF NOT EXISTS demo_evaluation_events (
  id BIGSERIAL PRIMARY KEY,
  evaluation_id TEXT NOT NULL REFERENCES demo_evaluation_responses(evaluation_id),
  action TEXT NOT NULL,
  stage TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('servidor','rh')),
  observation TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evaluation_events_parent ON demo_evaluation_events(evaluation_id,id);
