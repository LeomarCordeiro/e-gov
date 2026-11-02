CREATE TABLE IF NOT EXISTS demo_evaluation_responses (
    evaluation_id TEXT PRIMARY KEY,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    observation TEXT NOT NULL DEFAULT '',
    finished BOOLEAN NOT NULL DEFAULT false,
    agreement BOOLEAN,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
