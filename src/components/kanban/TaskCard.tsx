import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar } from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Task } from "./types";

export function TaskCardView({
  task,
  onOpen,
  dragging,
}: {
  task: Task;
  onOpen?: () => void;
  dragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Translate.toString(transform), transition };

  const due = task.due_date ? new Date(task.due_date) : null;
  const overdue = due && isPast(due) && !isToday(due) && task.status !== "done";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (isDragging) return;
        e.stopPropagation();
        onOpen?.();
      }}
      className={`group cursor-grab active:cursor-grabbing select-none rounded-lg border bg-card p-3 shadow-sm hover:shadow-md hover:border-primary/40 transition ${
        isDragging || dragging ? "opacity-60 ring-2 ring-primary" : ""
      }`}
    >
      <div className="text-sm font-medium leading-snug">{task.title}</div>
      {task.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{task.description}</p>
      )}
      {due && (
        <div className={`mt-2 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${
          overdue ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
        }`}>
          <Calendar className="h-3 w-3" />
          {format(due, "dd MMM", { locale: ptBR })}
        </div>
      )}
    </div>
  );
}
