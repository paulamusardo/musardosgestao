
ALTER TABLE public.task_attachments
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS task_attachments_one_pinned_per_task
  ON public.task_attachments(task_id) WHERE pinned;
