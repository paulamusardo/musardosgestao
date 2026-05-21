import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { Settings2 } from "lucide-react";
import type { ProjectColumn } from "./types";

export function Column({
  column,
  count,
  children,
  onConfigure,
}: {
  column: ProjectColumn;
  count: number;
  children: ReactNode;
  onConfigure?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${column.id}` });
  return (
    <div className="w-80 shrink-0 flex flex-col rounded-xl bg-muted/40 border">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: column.color }} />
          <h2 className="font-semibold text-sm truncate">{column.label}</h2>
          {column.is_in_progress && (
            <span className="text-[10px] uppercase text-primary font-semibold">⏱</span>
          )}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 p-3 space-y-2 overflow-y-auto transition-colors ${isOver ? "bg-accent/40" : ""}`}
      >
        {children}
        {count === 0 && (
          <div className="text-xs text-muted-foreground/70 text-center py-8 border border-dashed rounded-lg">
            Solte uma tarefa aqui
          </div>
        )}
      </div>
    </div>
  );
}
