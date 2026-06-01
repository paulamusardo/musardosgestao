
CREATE OR REPLACE FUNCTION public.shares_project_with(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pa
    JOIN public.project_members pb ON pa.project_id = pb.project_id
    WHERE pa.user_id = _a AND pb.user_id = _b
  );
$$;

DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
CREATE POLICY "Profiles readable to self or co-members"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.shares_project_with(auth.uid(), id));

DROP POLICY IF EXISTS "Owners manage members insert" ON public.project_members;
CREATE POLICY "Owners manage members insert"
  ON public.project_members FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));

CREATE POLICY "Members insert time entries"
  ON public.task_time_entries FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t
    WHERE t.id = task_time_entries.task_id
      AND t.project_id IS NOT NULL
      AND public.is_project_member(t.project_id, auth.uid())));

CREATE POLICY "Members update time entries"
  ON public.task_time_entries FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t
    WHERE t.id = task_time_entries.task_id
      AND t.project_id IS NOT NULL
      AND public.is_project_member(t.project_id, auth.uid())));

CREATE POLICY "Owners delete time entries"
  ON public.task_time_entries FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t
    WHERE t.id = task_time_entries.task_id
      AND t.project_id IS NOT NULL
      AND public.is_project_owner(t.project_id, auth.uid())));

DROP POLICY IF EXISTS "Members view tasks" ON public.tasks;
CREATE POLICY "Members view tasks" ON public.tasks FOR SELECT TO authenticated
  USING ((project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid()))
      OR (project_id IS NULL AND created_by = auth.uid()));

DROP POLICY IF EXISTS "Members insert tasks" ON public.tasks;
CREATE POLICY "Members insert tasks" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND (
    (project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid()))
    OR project_id IS NULL));

DROP POLICY IF EXISTS "Members update tasks" ON public.tasks;
CREATE POLICY "Members update tasks" ON public.tasks FOR UPDATE TO authenticated
  USING ((project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid()))
      OR (project_id IS NULL AND created_by = auth.uid()));

DROP POLICY IF EXISTS "Members delete tasks" ON public.tasks;
CREATE POLICY "Members delete tasks" ON public.tasks FOR DELETE TO authenticated
  USING ((project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid()))
      OR (project_id IS NULL AND created_by = auth.uid()));

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_project_owner() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_task_column_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shares_project_with(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shares_project_with(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Avatar public read" ON storage.objects;
