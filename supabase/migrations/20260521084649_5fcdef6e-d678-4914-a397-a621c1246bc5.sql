
-- 1. project_members
CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- security definer membership check (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_members WHERE project_id = _project_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_project_owner(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_members WHERE project_id = _project_id AND user_id = _user_id AND role = 'owner');
$$;

-- 2. project_columns
CREATE TABLE public.project_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  label text NOT NULL,
  position double precision NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT '#94a3b8',
  is_in_progress boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_columns_project_idx ON public.project_columns(project_id, position);
ALTER TABLE public.project_columns ENABLE ROW LEVEL SECURITY;

-- ensure at most one in_progress column per project
CREATE UNIQUE INDEX project_columns_one_in_progress
  ON public.project_columns(project_id) WHERE is_in_progress;

-- 3. task_assignees
CREATE TABLE public.task_assignees (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

-- 4. task_time_entries
CREATE TABLE public.task_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX task_time_entries_task_idx ON public.task_time_entries(task_id);
ALTER TABLE public.task_time_entries ENABLE ROW LEVEL SECURITY;

-- 5. add column_id and total_seconds to tasks
ALTER TABLE public.tasks ADD COLUMN column_id uuid REFERENCES public.project_columns(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN total_seconds integer NOT NULL DEFAULT 0;

-- 6. backfill: every existing project becomes a "personal" project,
--    create default columns, map task.status -> column_id, add owner as member
DO $$
DECLARE p record; c_todo uuid; c_prog uuid; c_rev uuid; c_done uuid;
BEGIN
  FOR p IN SELECT id, created_by FROM public.projects LOOP
    INSERT INTO public.project_columns (project_id, label, position, color, is_in_progress)
      VALUES (p.id, 'A Fazer', 1, '#94a3b8', false) RETURNING id INTO c_todo;
    INSERT INTO public.project_columns (project_id, label, position, color, is_in_progress)
      VALUES (p.id, 'Em Andamento', 2, '#3b82f6', true) RETURNING id INTO c_prog;
    INSERT INTO public.project_columns (project_id, label, position, color, is_in_progress)
      VALUES (p.id, 'Revisão', 3, '#f59e0b', false) RETURNING id INTO c_rev;
    INSERT INTO public.project_columns (project_id, label, position, color, is_in_progress)
      VALUES (p.id, 'Concluído', 4, '#10b981', false) RETURNING id INTO c_done;

    UPDATE public.tasks SET column_id = CASE status
      WHEN 'todo' THEN c_todo
      WHEN 'in_progress' THEN c_prog
      WHEN 'review' THEN c_rev
      WHEN 'done' THEN c_done
    END WHERE project_id = p.id;

    INSERT INTO public.project_members (project_id, user_id, role)
      VALUES (p.id, p.created_by, 'owner') ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- handle orphan tasks (project_id null) — leave column_id null; not displayed

-- 7. trigger: open/close time entries on column change
CREATE OR REPLACE FUNCTION public.handle_task_column_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old_in_progress boolean := false;
  new_in_progress boolean := false;
  open_entry record;
  seconds_added integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.column_id IS NOT NULL THEN
      SELECT is_in_progress INTO new_in_progress FROM public.project_columns WHERE id = NEW.column_id;
      IF new_in_progress THEN
        INSERT INTO public.task_time_entries (task_id) VALUES (NEW.id);
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.column_id IS DISTINCT FROM OLD.column_id THEN
    IF OLD.column_id IS NOT NULL THEN
      SELECT is_in_progress INTO old_in_progress FROM public.project_columns WHERE id = OLD.column_id;
    END IF;
    IF NEW.column_id IS NOT NULL THEN
      SELECT is_in_progress INTO new_in_progress FROM public.project_columns WHERE id = NEW.column_id;
    END IF;

    IF COALESCE(old_in_progress,false) AND NOT COALESCE(new_in_progress,false) THEN
      -- close open entry
      SELECT * INTO open_entry FROM public.task_time_entries
        WHERE task_id = NEW.id AND ended_at IS NULL
        ORDER BY started_at DESC LIMIT 1;
      IF FOUND THEN
        UPDATE public.task_time_entries SET ended_at = now() WHERE id = open_entry.id;
        seconds_added := EXTRACT(EPOCH FROM (now() - open_entry.started_at))::integer;
        NEW.total_seconds := COALESCE(OLD.total_seconds,0) + seconds_added;
      END IF;
    ELSIF NOT COALESCE(old_in_progress,false) AND COALESCE(new_in_progress,false) THEN
      INSERT INTO public.task_time_entries (task_id) VALUES (NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER task_column_change_trigger
  BEFORE INSERT OR UPDATE OF column_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_task_column_change();

-- 8. RLS policies

-- projects: drop old broad policies, gate by membership
DROP POLICY IF EXISTS "Projects viewable by authenticated" ON public.projects;
DROP POLICY IF EXISTS "Authenticated can insert projects" ON public.projects;
DROP POLICY IF EXISTS "Owners can update projects" ON public.projects;
DROP POLICY IF EXISTS "Owners can delete projects" ON public.projects;

CREATE POLICY "Members can view projects" ON public.projects FOR SELECT TO authenticated
  USING (public.is_project_member(id, auth.uid()));
CREATE POLICY "Authenticated can insert projects" ON public.projects FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Owners can update projects" ON public.projects FOR UPDATE TO authenticated
  USING (public.is_project_owner(id, auth.uid()));
CREATE POLICY "Owners can delete projects" ON public.projects FOR DELETE TO authenticated
  USING (public.is_project_owner(id, auth.uid()));

-- auto-add creator as owner
CREATE OR REPLACE FUNCTION public.add_project_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.project_members (project_id, user_id, role)
    VALUES (NEW.id, NEW.created_by, 'owner') ON CONFLICT DO NOTHING;
  -- seed default columns
  INSERT INTO public.project_columns (project_id, label, position, color, is_in_progress) VALUES
    (NEW.id, 'A Fazer', 1, '#94a3b8', false),
    (NEW.id, 'Em Andamento', 2, '#3b82f6', true),
    (NEW.id, 'Revisão', 3, '#f59e0b', false),
    (NEW.id, 'Concluído', 4, '#10b981', false);
  RETURN NEW;
END $$;

CREATE TRIGGER projects_after_insert
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.add_project_owner();

-- project_members policies
CREATE POLICY "Members can view membership" ON public.project_members FOR SELECT TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners manage members insert" ON public.project_members FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id, auth.uid()) OR (role = 'owner' AND user_id = auth.uid()));
CREATE POLICY "Owners manage members delete" ON public.project_members FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()) AND NOT (role = 'owner' AND user_id = auth.uid()));

-- project_columns policies
CREATE POLICY "Members view columns" ON public.project_columns FOR SELECT TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert columns" ON public.project_columns FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Owners update columns" ON public.project_columns FOR UPDATE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Owners delete columns" ON public.project_columns FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()));

-- tasks: replace broad with member-gated
DROP POLICY IF EXISTS "Tasks viewable by authenticated" ON public.tasks;
DROP POLICY IF EXISTS "Authenticated can insert tasks" ON public.tasks;
DROP POLICY IF EXISTS "Authenticated can update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Authenticated can delete tasks" ON public.tasks;

CREATE POLICY "Members view tasks" ON public.tasks FOR SELECT TO authenticated
  USING (project_id IS NULL OR public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members insert tasks" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND (project_id IS NULL OR public.is_project_member(project_id, auth.uid())));
CREATE POLICY "Members update tasks" ON public.tasks FOR UPDATE TO authenticated
  USING (project_id IS NULL OR public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members delete tasks" ON public.tasks FOR DELETE TO authenticated
  USING (project_id IS NULL OR public.is_project_member(project_id, auth.uid()));

-- comments: gate by task membership
DROP POLICY IF EXISTS "Comments viewable by authenticated" ON public.comments;
DROP POLICY IF EXISTS "Authenticated insert own comments" ON public.comments;
DROP POLICY IF EXISTS "Users delete own comments" ON public.comments;

CREATE POLICY "Members view comments" ON public.comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (t.project_id IS NULL OR public.is_project_member(t.project_id, auth.uid()))));
CREATE POLICY "Members insert comments" ON public.comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (t.project_id IS NULL OR public.is_project_member(t.project_id, auth.uid()))));
CREATE POLICY "Users delete own comments" ON public.comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- task_assignees
CREATE POLICY "Members view assignees" ON public.task_assignees FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (t.project_id IS NULL OR public.is_project_member(t.project_id, auth.uid()))));
CREATE POLICY "Members insert assignees" ON public.task_assignees FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (t.project_id IS NULL OR public.is_project_member(t.project_id, auth.uid()))));
CREATE POLICY "Members delete assignees" ON public.task_assignees FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (t.project_id IS NULL OR public.is_project_member(t.project_id, auth.uid()))));

-- task_time_entries (read-only to members; writes via trigger)
CREATE POLICY "Members view time entries" ON public.task_time_entries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (t.project_id IS NULL OR public.is_project_member(t.project_id, auth.uid()))));

-- profiles: allow lookup by email for invitation (already viewable to authenticated)

-- realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_columns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_assignees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_time_entries;
