-- Projects table
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  client text,
  color text NOT NULL DEFAULT '#6366f1',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Projects viewable by authenticated"
  ON public.projects FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert projects"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owners can update projects"
  ON public.projects FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Owners can delete projects"
  ON public.projects FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

CREATE TRIGGER projects_touch_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Link tasks to projects
ALTER TABLE public.tasks ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
CREATE INDEX idx_tasks_project_id ON public.tasks(project_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;