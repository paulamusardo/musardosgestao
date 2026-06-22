
-- Tighten task_time_entries SELECT to restrict personal tasks to owner
DROP POLICY IF EXISTS "Members view time entries" ON public.task_time_entries;
CREATE POLICY "Members view time entries" ON public.task_time_entries
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_time_entries.task_id
      AND (
        (t.project_id IS NOT NULL AND public.is_project_member(t.project_id, auth.uid()))
        OR (t.project_id IS NULL AND t.created_by = auth.uid())
      )
  )
);

-- Defence-in-depth public read policy for avatars bucket
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
CREATE POLICY "Public read avatars" ON storage.objects
FOR SELECT
USING (bucket_id = 'avatars');
