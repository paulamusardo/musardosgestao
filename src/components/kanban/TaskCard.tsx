import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, Timer } from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Task, Profile, TaskTimeEntry } from "./types";
import { formatDuration } from "./types";
import { stripHtml } from "./RichTextEditor";
import { AttachmentCount, PinnedAttachmentPreview } from "./AttachmentList";

export function TaskCardView({
  task,
  assignees,
  openEntry,
  isDone,
  onOpen,
  dragging,
}: {
  task: Task;
  assignees?: Profile[];
  openEntry?: TaskTimeEntry | null;
  isDone?: boolean;
  onOpen?: () => void;
  dragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Translate.toString(transform), transition };

  const due = task.due_date ? new Date(task.due_date) : null;
  const overdue = due && isPast(due) && !isToday(due) && !isDone;

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!openEntry) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [openEntry?.id]);

  const liveSeconds = openEntry
    ? task.total_seconds + Math.floor((Date.now() - new Date(openEntry.started_at).getTime()) / 1000)
    : task.total_seconds;

  // Track recent drag so the synthetic click after pointer release does not open the dialog.
  const justDragged = useRef(false);
  useEffect(() => {
    if (isDragging) justDragged.current = true;
  }, [isDragging]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (justDragged.current) {
          justDragged.current = false;
          return;
        }
        if (isDragging) return;
        e.stopPropagation();
        onOpen?.();
      }}
      className={`group cursor-grab active:cursor-grabbing select-none rounded-lg border bg-card p-3 shadow-sm hover:shadow-md hover:border-primary/40 transition overflow-hidden ${
        isDragging || dragging ? "opacity-60 ring-2 ring-primary" : ""
      }`}
    >
      <PinnedAttachmentPreview taskId={task.id} />
      <div className="text-sm font-medium leading-snug">{task.title}</div>
      {task.description && stripHtml(task.description) && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{stripHtml(task.description)}</p>
      )}

      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {due && (
          <div className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${
            overdue ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
          }`}>
            <Calendar className="h-3 w-3" />
            {format(due, "dd MMM", { locale: ptBR })}
          </div>
        )}
        {liveSeconds > 0 && (
          <div className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${
            openEntry ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          }`}>
            <Timer className={`h-3 w-3 ${openEntry ? "animate-pulse" : ""}`} />
            {formatDuration(liveSeconds)}
          </div>
        )}
        <AttachmentCount taskId={task.id} />
        <div className="ml-auto flex -space-x-1.5">
          {(assignees ?? []).slice(0, 3).map((p) => {
            const name = p.display_name || p.email || "?";
            return (
              <div
                key={p.id}
                title={name}
                className="h-6 w-6 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center border-2 border-card"
              >
                {name.slice(0, 2).toUpperCase()}
              </div>
            );
          })}
          {(assignees?.length ?? 0) > 3 && (
            <div className="h-6 w-6 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold flex items-center justify-center border-2 border-card">
              +{(assignees?.length ?? 0) - 3}
            </div>
          )}
        </div>
      </div>
      {tick < 0 && null}
    </div>
  );
}
