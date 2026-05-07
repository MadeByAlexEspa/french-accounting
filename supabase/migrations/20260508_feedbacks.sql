CREATE TABLE feedbacks (
  id BIGSERIAL PRIMARY KEY,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 5 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE feedback_votes (
  feedback_id BIGINT NOT NULL REFERENCES feedbacks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (feedback_id, user_id)
);

ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feedbacks_select" ON feedbacks FOR SELECT TO authenticated USING (true);
CREATE POLICY "feedbacks_insert" ON feedbacks FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "feedbacks_delete" ON feedbacks FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "feedback_votes_select" ON feedback_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY "feedback_votes_insert" ON feedback_votes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "feedback_votes_delete" ON feedback_votes FOR DELETE TO authenticated USING (user_id = auth.uid());
