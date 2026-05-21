export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string; // legacy enum, ignored
  column_id: string | null;
  due_date: string | null;
  position: number;
  project_id: string | null;
  created_by: string;
  total_seconds: number;
  created_at: string;
  updated_at: string;
};

export type Comment = {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

export type Project = {
  id: string;
  name: string;
  client: string | null;
  color: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ProjectColumn = {
  id: string;
  project_id: string;
  label: string;
  position: number;
  color: string;
  is_in_progress: boolean;
};

export type ProjectMember = {
  id: string;
  project_id: string;
  user_id: string;
  role: "owner" | "member";
};

export type TaskAssignee = { task_id: string; user_id: string };

export type TaskTimeEntry = {
  id: string;
  task_id: string;
  started_at: string;
  ended_at: string | null;
};

export type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
};

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

export function formatDurationLong(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
