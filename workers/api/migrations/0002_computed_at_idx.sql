-- D1: hot query ORDER BY computed_at DESC needs index (was only class idx)
CREATE INDEX IF NOT EXISTS projection_docs_computed_at_idx ON projection_docs(computed_at DESC);
