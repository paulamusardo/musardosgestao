CREATE POLICY "Members update attachments"
ON public.task_attachments FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_attachments.task_id AND ((t.project_id IS NULL AND t.created_by = auth.uid()) OR (t.project_id IS NOT NULL AND public.is_project_member(t.project_id, auth.uid())))))
WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_attachments.task_id AND ((t.project_id IS NULL AND t.created_by = auth.uid()) OR (t.project_id IS NOT NULL AND public.is_project_member(t.project_id, auth.uid())))));