ALTER TABLE public.projects ADD COLUMN position double precision NOT NULL DEFAULT 0;
CREATE INDEX projects_position_idx ON public.projects(position);

-- Backfill existing projects with stable positions based on creation order.
DO $$
DECLARE rec record; pos double precision := 0;
BEGIN
  FOR rec IN SELECT id FROM public.projects ORDER BY created_at ASC LOOP
    UPDATE public.projects SET position = pos WHERE id = rec.id;
    pos := pos + 1;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

-- Security definer helper so any authenticated user can reorder projects in the sidebar.
CREATE OR REPLACE FUNCTION public.update_project_order(_project_id uuid, _position double precision)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.projects SET position = _position WHERE id = _project_id;
$$;

GRANT EXECUTE ON FUNCTION public.update_project_order(uuid, double precision) TO authenticated;