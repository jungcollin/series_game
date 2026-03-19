-- Stage Votes: upvote/downvote per stage with visitor-based deduplication
CREATE TABLE IF NOT EXISTS public.stage_votes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stage_id text NOT NULL,
  visitor_id text NOT NULL,
  vote smallint NOT NULL CHECK (vote IN (1, -1)),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 1 visitor = 1 vote per stage
CREATE UNIQUE INDEX IF NOT EXISTS stage_votes_unique_idx
  ON public.stage_votes (stage_id, visitor_id);

-- Fast aggregation by stage
CREATE INDEX IF NOT EXISTS stage_votes_stage_id_idx
  ON public.stage_votes (stage_id);

-- Aggregated view: score = upvotes - downvotes
CREATE OR REPLACE VIEW public.stage_vote_scores AS
  SELECT
    stage_id,
    COALESCE(SUM(vote), 0)::int AS score,
    COUNT(*) FILTER (WHERE vote = 1)::int AS upvotes,
    COUNT(*) FILTER (WHERE vote = -1)::int AS downvotes
  FROM public.stage_votes
  GROUP BY stage_id;

-- Row Level Security
ALTER TABLE public.stage_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read votes" ON public.stage_votes;
CREATE POLICY "Anyone can read votes"
  ON public.stage_votes
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert votes" ON public.stage_votes;
CREATE POLICY "Anyone can insert votes"
  ON public.stage_votes
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(trim(visitor_id)) >= 8
    AND char_length(trim(stage_id)) >= 1
    AND vote IN (1, -1)
  );

DROP POLICY IF EXISTS "Anyone can update votes" ON public.stage_votes;
CREATE POLICY "Anyone can update votes"
  ON public.stage_votes
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (vote IN (1, -1));

DROP POLICY IF EXISTS "Anyone can delete votes" ON public.stage_votes;
CREATE POLICY "Anyone can delete votes"
  ON public.stage_votes
  FOR DELETE
  TO anon, authenticated
  USING (true);
