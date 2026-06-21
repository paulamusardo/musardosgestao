
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- Fan out task_activities to assignees as notifications
CREATE OR REPLACE FUNCTION public.fanout_task_activity_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip self-attribution actions where actor matches the only target (still notify others)
  INSERT INTO public.notifications(user_id, actor_id, task_id, project_id, kind, metadata)
  SELECT ta.user_id, NEW.user_id, NEW.task_id, NEW.project_id, NEW.action, NEW.metadata
  FROM public.task_assignees ta
  WHERE ta.task_id = NEW.task_id
    AND ta.user_id IS DISTINCT FROM NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_fanout_task_activity_notifications
AFTER INSERT ON public.task_activities
FOR EACH ROW EXECUTE FUNCTION public.fanout_task_activity_notifications();

-- Also notify a user when they are newly assigned (the assignee themselves)
CREATE OR REPLACE FUNCTION public.notify_new_assignee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj UUID;
BEGIN
  IF NEW.user_id = auth.uid() THEN
    RETURN NEW;
  END IF;
  SELECT project_id INTO proj FROM public.tasks WHERE id = NEW.task_id;
  INSERT INTO public.notifications(user_id, actor_id, task_id, project_id, kind, metadata)
  VALUES (NEW.user_id, auth.uid(), NEW.task_id, proj, 'assigned_to_you', '{}'::jsonb);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_assignee
AFTER INSERT ON public.task_assignees
FOR EACH ROW EXECUTE FUNCTION public.notify_new_assignee();
