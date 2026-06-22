
-- Drop existing task-attachments policies and recreate with path integrity
DROP POLICY IF EXISTS "Members read task attachments" ON storage.objects;
DROP POLICY IF EXISTS "Members upload task attachments" ON storage.objects;
DROP POLICY IF EXISTS "Uploader or owner deletes task attachments" ON storage.objects;
DROP POLICY IF EXISTS "Members delete task attachments" ON storage.objects;
DROP POLICY IF EXISTS "Uploader or owner updates task attachments" ON storage.objects;

-- Helper: project_id is folder[1], task_id is folder[2]
CREATE POLICY "Members read task attachments" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = (NULLIF((storage.foldername(name))[2], ''))::uuid
      AND t.project_id = (NULLIF((storage.foldername(name))[1], ''))::uuid
      AND public.is_project_member(t.project_id, auth.uid())
  )
);

CREATE POLICY "Members upload task attachments" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'task-attachments'
  AND owner = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = (NULLIF((storage.foldername(name))[2], ''))::uuid
      AND t.project_id = (NULLIF((storage.foldername(name))[1], ''))::uuid
      AND public.is_project_member(t.project_id, auth.uid())
  )
);

CREATE POLICY "Uploader or owner updates task attachments" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND (
    owner = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.task_attachments ta
      JOIN public.tasks t ON t.id = ta.task_id
      WHERE ta.path = storage.objects.name
        AND (ta.uploader_id = auth.uid() OR public.is_project_owner(t.project_id, auth.uid()))
    )
  )
)
WITH CHECK (
  bucket_id = 'task-attachments'
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = (NULLIF((storage.foldername(name))[2], ''))::uuid
      AND t.project_id = (NULLIF((storage.foldername(name))[1], ''))::uuid
      AND public.is_project_member(t.project_id, auth.uid())
  )
);

CREATE POLICY "Uploader or owner deletes task attachments" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND (
    owner = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.task_attachments ta
      JOIN public.tasks t ON t.id = ta.task_id
      WHERE ta.path = storage.objects.name
        AND (ta.uploader_id = auth.uid() OR public.is_project_owner(t.project_id, auth.uid()))
    )
  )
);
