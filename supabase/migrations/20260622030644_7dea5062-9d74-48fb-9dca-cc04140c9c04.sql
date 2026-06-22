
-- 1. Restrict task_activities INSERT
DROP POLICY IF EXISTS "System can insert activities" ON public.task_activities;
CREATE POLICY "Members insert activities" ON public.task_activities
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.tasks t WHERE t.id = task_activities.task_id
      AND ((t.project_id IS NOT NULL AND public.is_project_member(t.project_id, auth.uid()))
           OR (t.project_id IS NULL AND t.created_by = auth.uid()))
  )
);

-- 2. comments SELECT - personal task ownership
DROP POLICY IF EXISTS "Members view comments" ON public.comments;
CREATE POLICY "Members view comments" ON public.comments
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tasks t WHERE t.id = comments.task_id
    AND ((t.project_id IS NOT NULL AND public.is_project_member(t.project_id, auth.uid()))
         OR (t.project_id IS NULL AND t.created_by = auth.uid()))
));

DROP POLICY IF EXISTS "Members insert comments" ON public.comments;
CREATE POLICY "Members insert comments" ON public.comments
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.tasks t WHERE t.id = comments.task_id
      AND ((t.project_id IS NOT NULL AND public.is_project_member(t.project_id, auth.uid()))
           OR (t.project_id IS NULL AND t.created_by = auth.uid()))
  )
);

-- 3. task_assignees - personal task ownership for view/insert/delete
DROP POLICY IF EXISTS "Members view assignees" ON public.task_assignees;
CREATE POLICY "Members view assignees" ON public.task_assignees
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tasks t WHERE t.id = task_assignees.task_id
    AND ((t.project_id IS NOT NULL AND public.is_project_member(t.project_id, auth.uid()))
         OR (t.project_id IS NULL AND t.created_by = auth.uid()))
));

DROP POLICY IF EXISTS "Members insert assignees" ON public.task_assignees;
CREATE POLICY "Members insert assignees" ON public.task_assignees
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.tasks t WHERE t.id = task_assignees.task_id
    AND ((t.project_id IS NOT NULL AND public.is_project_member(t.project_id, auth.uid()))
         OR (t.project_id IS NULL AND t.created_by = auth.uid()))
));

DROP POLICY IF EXISTS "Members delete assignees" ON public.task_assignees;
CREATE POLICY "Members delete assignees" ON public.task_assignees
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tasks t WHERE t.id = task_assignees.task_id
    AND ((t.project_id IS NOT NULL AND public.is_project_member(t.project_id, auth.uid()))
         OR (t.project_id IS NULL AND t.created_by = auth.uid()))
));

-- 4. Storage: restrict DELETE on task-attachments to uploader or project owner
DROP POLICY IF EXISTS "Members delete task attachments" ON storage.objects;
CREATE POLICY "Uploader or owner deletes task attachments" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND (
    EXISTS (
      SELECT 1 FROM public.task_attachments ta
      WHERE ta.path = storage.objects.name
        AND (ta.uploader_id = auth.uid()
             OR public.is_project_owner(
               (SELECT project_id FROM public.tasks WHERE id = ta.task_id),
               auth.uid()))
    )
  )
);

-- 5. Revoke EXECUTE from anon/public on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.is_project_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_project_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.shares_project_with(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.move_task_to_kind(uuid, public.column_kind) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_project_order(uuid, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_project_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_project_with(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_task_to_kind(uuid, public.column_kind) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_project_order(uuid, double precision) TO authenticated;
