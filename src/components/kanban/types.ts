export type ColumnKind = "todo" | "in_progress" | "review" | "done" | "custom";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
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
  position: number;
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
  kind: ColumnKind;
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

export type TaskAttachment = {
  id: string;
  task_id: string;
  comment_id: string | null;
  uploader_id: string;
  path: string;
  name: string;
  mime: string | null;
  size: number | null;
  pinned: boolean;
  created_at: string;
};

export type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url?: string | null;
};

export type TaskActivity = {
  id: string;
  task_id: string;
  project_id: string | null;
  user_id: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export const PERSONAL_COLUMNS: { kind: ColumnKind; label: string; color: string }[] = [
  { kind: "todo", label: "A Fazer", color: "#94a3b8" },
  { kind: "in_progress", label: "Em Andamento", color: "#1e88e5" },
  { kind: "review", label: "Revisão", color: "#f59e0b" },
  { kind: "done", label: "Concluído", color: "#10b981" },
];

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
