CREATE TABLE IF NOT EXISTS satisfaction_feedback (
    id BIGSERIAL PRIMARY KEY,
    submission_id UUID NOT NULL UNIQUE,
    score SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
    page TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
