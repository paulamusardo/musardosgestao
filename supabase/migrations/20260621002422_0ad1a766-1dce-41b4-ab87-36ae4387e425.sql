-- Activity log table for tasks
CREATE TABLE public.task_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  project_id UUID,
  user_id UUID,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_activities_task ON public.task_activities(task_id, created_at DESC);

GRANT SELECT, INSERT ON public.task_activities TO authenticated;
GRANT ALL ON public.task_activities TO service_role;

ALTER TABLE public.task_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view activities of their project tasks"
  ON public.task_activities FOR SELECT
  TO authenticated
  USING (
    project_id IS NULL
    OR public.is_project_member(project_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
  );

CREATE POLICY "System can insert activities"
  ON public.task_activities FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Trigger function for tasks
CREATE OR REPLACE FUNCTION public.log_task_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  from_label TEXT;
  to_label TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_activities(task_id, project_id, user_id, action, metadata)
    VALUES (NEW.id, NEW.project_id, COALESCE(actor, NEW.created_by), 'created',
      jsonb_build_object('title', NEW.title, 'column_id', NEW.column_id));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.column_id IS DISTINCT FROM OLD.column_id THEN
      SELECT label INTO from_label FROM public.project_columns WHERE id = OLD.column_id;
      SELECT label INTO to_label FROM public.project_columns WHERE id = NEW.column_id;
      INSERT INTO public.task_activities(task_id, project_id, user_id, action, metadata)
      VALUES (NEW.id, NEW.project_id, actor, 'moved',
        jsonb_build_object(
          'from_column_id', OLD.column_id, 'to_column_id', NEW.column_id,
          'from_label', from_label, 'to_label', to_label
        ));
    END IF;
    IF NEW.title IS DISTINCT FROM OLD.title THEN
      INSERT INTO public.task_activities(task_id, project_id, user_id, action, metadata)
      VALUES (NEW.id, NEW.project_id, actor, 'renamed',
        jsonb_build_object('from', OLD.title, 'to', NEW.title));
    END IF;
    IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      INSERT INTO public.task_activities(task_id, project_id, user_id, action, metadata)
      VALUES (NEW.id, NEW.project_id, actor, 'due_date_changed',
        jsonb_build_object('from', OLD.due_date, 'to', NEW.due_date));
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_log_task_activity
AFTER INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.log_task_activity();

-- Assignees log
CREATE OR REPLACE FUNCTION public.log_task_assignee_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  proj UUID;
  tid UUID;
  uid UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    tid := NEW.task_id; uid := NEW.user_id;
  ELSE
    tid := OLD.task_id; uid := OLD.user_id;
  END IF;
  SELECT project_id INTO proj FROM public.tasks WHERE id = tid;
  INSERT INTO public.task_activities(task_id, project_id, user_id, action, metadata)
  VALUES (tid, proj, actor,
    CASE WHEN TG_OP = 'INSERT' THEN 'assignee_added' ELSE 'assignee_removed' END,
    jsonb_build_object('target_user_id', uid));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_log_task_assignee_activity
AFTER INSERT OR DELETE ON public.task_assignees
FOR EACH ROW EXECUTE FUNCTION public.log_task_assignee_activity();

-- Comments log
CREATE OR REPLACE FUNCTION public.log_task_comment_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj UUID;
BEGIN
  SELECT project_id INTO proj FROM public.tasks WHERE id = NEW.task_id;
  INSERT INTO public.task_activities(task_id, project_id, user_id, action, metadata)
  VALUES (NEW.task_id, proj, NEW.user_id, 'commented',
    jsonb_build_object('comment_id', NEW.id));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_task_comment_activity
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.log_task_comment_activity();

-- Attachments log
CREATE OR REPLACE FUNCTION public.log_task_attachment_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj UUID;
BEGIN
  SELECT project_id INTO proj FROM public.tasks WHERE id = NEW.task_id;
  INSERT INTO public.task_activities(task_id, project_id, user_id, action, metadata)
  VALUES (NEW.task_id, proj, NEW.uploader_id, 'attached',
    jsonb_build_object('attachment_id', NEW.id, 'name', NEW.name));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_task_attachment_activity
AFTER INSERT ON public.task_attachments
FOR EACH ROW EXECUTE FUNCTION public.log_task_attachment_activity();

ALTER PUBLICATION supabase_realtime ADD TABLE public.task_activities;