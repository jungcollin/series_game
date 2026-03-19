-- Stage Comments: per-stage comment thread
CREATE TABLE IF NOT EXISTS public.stage_comments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stage_id text NOT NULL,
  visitor_id text NOT NULL,
  author_name text NOT NULL CHECK (char_length(trim(author_name)) BETWEEN 1 AND 24),
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS stage_comments_stage_idx
  ON public.stage_comments (stage_id, created_at DESC);

ALTER TABLE public.stage_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read comments" ON public.stage_comments;
CREATE POLICY "Anyone can read comments"
  ON public.stage_comments
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert comments" ON public.stage_comments;
CREATE POLICY "Anyone can insert comments"
  ON public.stage_comments
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(trim(author_name)) BETWEEN 1 AND 24
    AND char_length(trim(body)) BETWEEN 1 AND 500
    AND char_length(trim(stage_id)) >= 1
    AND char_length(trim(visitor_id)) >= 8
  );
