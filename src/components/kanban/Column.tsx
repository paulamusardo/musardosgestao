import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";
import type { Task, TaskStatus } from "./types";

export function Column({
  column,
  items,
  children,
}: {
  column: { key: TaskStatus; label: string; tone: string };
  items: Task[];
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
  return (
    <div className="w-80 shrink-0 flex flex-col rounded-xl bg-muted/40 border">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: column.tone }} />
          <h2 className="font-semibold text-sm">{column.label}</h2>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 p-3 space-y-2 overflow-y-auto transition-colors ${isOver ? "bg-accent/40" : ""}`}
      >
        {children}
        {items.length === 0 && (
          <div className="text-xs text-muted-foreground/70 text-center py-8 border border-dashed rounded-lg">
            Solte uma tarefa aqui
          </div>
        )}
      </div>
    </div>
  );
}
