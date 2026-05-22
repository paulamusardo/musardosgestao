
-- 1. Add kind enum to project_columns for cross-project column mapping
CREATE TYPE public.column_kind AS ENUM ('todo','in_progress','review','done','custom');
ALTER TABLE public.project_columns ADD COLUMN kind public.column_kind NOT NULL DEFAULT 'custom';

-- Backfill kind for existing default columns by label
UPDATE public.project_columns SET kind = 'todo' WHERE lower(label) IN ('a fazer','todo','to do','backlog') AND kind = 'custom';
UPDATE public.project_columns SET kind = 'in_progress' WHERE (lower(label) IN ('em andamento','in progress','doing') OR is_in_progress = true) AND kind = 'custom';
UPDATE public.project_columns SET kind = 'review' WHERE lower(label) IN ('revisão','revisao','review','em revisão') AND kind = 'custom';
UPDATE public.project_columns SET kind = 'done' WHERE lower(label) IN ('concluído','concluido','done','feito') AND kind = 'custom';

-- Update the seed trigger to set kind
CREATE OR REPLACE FUNCTION public.add_project_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.project_members (project_id, user_id, role)
    VALUES (NEW.id, NEW.created_by, 'owner') ON CONFLICT DO NOTHING;
  INSERT INTO public.project_columns (project_id, label, position, color, is_in_progress, kind) VALUES
    (NEW.id, 'A Fazer', 1, '#94a3b8', false, 'todo'),
    (NEW.id, 'Em Andamento', 2, '#1e88e5', true, 'in_progress'),
    (NEW.id, 'Revisão', 3, '#f59e0b', false, 'review'),
    (NEW.id, 'Concluído', 4, '#10b981', false, 'done');
  RETURN NEW;
END $function$;

-- 2. RPC to move a task to the project column matching a kind (used by personal kanban)
CREATE OR REPLACE FUNCTION public.move_task_to_kind(_task_id uuid, _kind public.column_kind)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _project uuid;
  _new_col uuid;
BEGIN
  SELECT project_id INTO _project FROM public.tasks WHERE id = _task_id;
  IF _project IS NULL THEN RAISE EXCEPTION 'task has no project'; END IF;
  IF NOT public.is_project_member(_project, auth.uid()) THEN
    RAISE EXCEPTION 'not a project member';
  END IF;
  SELECT id INTO _new_col FROM public.project_columns
    WHERE project_id = _project AND kind = _kind
    ORDER BY position LIMIT 1;
  IF _new_col IS NULL THEN
    SELECT id INTO _new_col FROM public.project_columns
      WHERE project_id = _project ORDER BY position LIMIT 1;
  END IF;
  UPDATE public.tasks SET column_id = _new_col WHERE id = _task_id;
END $$;

-- 3. task_attachments table
CREATE TABLE public.task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL,
  path text NOT NULL,
  name text NOT NULL,
  mime text,
  size integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_attachments_task ON public.task_attachments(task_id);
CREATE INDEX idx_task_attachments_comment ON public.task_attachments(comment_id);
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view attachments" ON public.task_attachments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (t.project_id IS NULL OR public.is_project_member(t.project_id, auth.uid()))));

CREATE POLICY "Members insert attachments" ON public.task_attachments FOR INSERT TO authenticated
WITH CHECK (uploader_id = auth.uid() AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (t.project_id IS NULL OR public.is_project_member(t.project_id, auth.uid()))));

CREATE POLICY "Uploaders delete attachments" ON public.task_attachments FOR DELETE TO authenticated
USING (uploader_id = auth.uid() OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.project_id IS NOT NULL AND public.is_project_owner(t.project_id, auth.uid())));

-- 4. Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('task-attachments', 'task-attachments', false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for task-attachments (path: {project_id}/{task_id}/{file})
CREATE POLICY "Members read task attachments" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND public.is_project_member(
    NULLIF((storage.foldername(name))[1], '')::uuid,
    auth.uid()
  )
);

CREATE POLICY "Members upload task attachments" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'task-attachments'
  AND public.is_project_member(
    NULLIF((storage.foldername(name))[1], '')::uuid,
    auth.uid()
  )
);

CREATE POLICY "Members delete task attachments" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND public.is_project_member(
    NULLIF((storage.foldername(name))[1], '')::uuid,
    auth.uid()
  )
);

-- Avatars (public read, owner write — path: {user_id}/avatar.{ext})
CREATE POLICY "Avatar public read" ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "User upload own avatar" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "User update own avatar" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "User delete own avatar" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 5. profiles avatar_url
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- 6. Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_attachments;
