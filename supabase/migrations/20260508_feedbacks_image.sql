ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;

-- Storage bucket for feedback images (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-images', 'feedback-images', true)
ON CONFLICT (id) DO NOTHING;

-- Upload: authenticated users, only in their own subfolder
CREATE POLICY "feedback_images_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'feedback-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Read: public
CREATE POLICY "feedback_images_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'feedback-images');
