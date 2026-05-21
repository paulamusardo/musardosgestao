export type TaskStatus = "todo" | "in_progress" | "review" | "done";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  due_date: string | null;
  position: number;
  project_id: string | null;
  created_by: string;
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

export const COLUMNS: { key: TaskStatus; label: string; tone: string }[] = [
  { key: "todo", label: "A Fazer", tone: "var(--col-todo)" },
  { key: "in_progress", label: "Em Andamento", tone: "var(--col-progress)" },
  { key: "review", label: "Revisão", tone: "var(--col-review)" },
  { key: "done", label: "Concluído", tone: "var(--col-done)" },
];
