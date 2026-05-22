import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Column } from "@/components/kanban/Column";
import { TaskCardView } from "@/components/kanban/TaskCard";
import { TaskDialog } from "@/components/kanban/TaskDialog";
import { PERSONAL_COLUMNS } from "@/components/kanban/types";
import type { Task, Project, ProjectColumn, Profile, TaskTimeEntry, ColumnKind } from "@/components/kanban/types";

export const Route = createFileRoute("/_authenticated/me")({ component: MyKanbanPage });

function MyKanbanPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [columnsById, setColumnsById] = useState<Record<string, ProjectColumn>>({});
  const [projectsById, setProjectsById] = useState<Record<string, Project>>({});
  const [assigneesByTask, setAssigneesByTask] = useState<Record<string, Profile[]>>({});
  const [openEntries, setOpenEntries] = useState<Record<string, TaskTimeEntry>>({});
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [columnsForOpen, setColumnsForOpen] = useState<ProjectColumn[]>([]);
  const [membersForOpen, setMembersForOpen] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = async () => {
    if (!user) return;
    const { data: myA } = await supabase.from("task_assignees").select("task_id").eq("user_id", user.id);
    const taskIds = ((myA ?? []) as { task_id: string }[]).map((x) => x.task_id);
    if (!taskIds.length) { setTasks([]); setColumnsById({}); setProjectsById({}); setAssigneesByTask({}); setOpenEntries({}); return; }

    const { data: ts } = await supabase.from("tasks").select("*").in("id", taskIds);
    const list = ((ts ?? []) as unknown) as Task[];
    setTasks(list);

    const colIds = Array.from(new Set(list.map((t) => t.column_id).filter(Boolean) as string[]));
    const projIds = Array.from(new Set(list.map((t) => t.project_id).filter(Boolean) as string[]));

    const [{ data: cols }, { data: projs }, { data: aData }, { data: eData }] = await Promise.all([
      colIds.length ? supabase.from("project_columns").select("*").in("id", colIds) : Promise.resolve({ data: [] }),
      projIds.length ? supabase.from("projects").select("*").in("id", projIds) : Promise.resolve({ data: [] }),
      supabase.from("task_assignees").select("task_id, user_id").in("task_id", taskIds),
      supabase.from("task_time_entries").select("*").in("task_id", taskIds).is("ended_at", null),
    ]);

    const colMap: Record<string, ProjectColumn> = {};
    ((cols ?? []) as ProjectColumn[]).forEach((c) => { colMap[c.id] = c; });
    setColumnsById(colMap);

    const projMap: Record<string, Project> = {};
    ((projs ?? []) as Project[]).forEach((p) => { projMap[p.id] = p; });
    setProjectsById(projMap);

    const assignees = (aData ?? []) as { task_id: string; user_id: string }[];
    const userIds = Array.from(new Set(assignees.map((a) => a.user_id)));
    const profMap: Record<string, Profile> = {};
    if (userIds.length) {
      const { data: ps } = await supabase.from("profiles").select("id, display_name, email, avatar_url").in("id", userIds);
      ((ps ?? []) as Profile[]).forEach((p) => { profMap[p.id] = p; });
    }
    const aMap: Record<string, Profile[]> = {};
    assignees.forEach((a) => {
      if (!aMap[a.task_id]) aMap[a.task_id] = [];
      if (profMap[a.user_id]) aMap[a.task_id].push(profMap[a.user_id]);
    });
    setAssigneesByTask(aMap);

    const entriesMap: Record<string, TaskTimeEntry> = {};
    ((eData ?? []) as TaskTimeEntry[]).forEach((e) => { entriesMap[e.task_id] = e; });
    setOpenEntries(entriesMap);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("me-kanban")
      .on("postgres_changes", { event: "*", schema: "public", table: "task_assignees" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_time_entries" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [user?.id]);

  const grouped = useMemo(() => {
    const g: Record<ColumnKind, Task[]> = { todo: [], in_progress: [], review: [], done: [], custom: [] };
    for (const t of tasks) {
      const col = t.column_id ? columnsById[t.column_id] : null;
      const kind = (col?.kind ?? "custom") as ColumnKind;
      const bucket = kind === "custom" ? "todo" : kind;
      g[bucket].push(t);
    }
    return g;
  }, [tasks, columnsById]);

  const active = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;

  const findContainer = (id: string): ColumnKind | null => {
    if (id.startsWith("col:")) return id.slice(4) as ColumnKind;
    const t = tasks.find((x) => x.id === id);
    if (!t || !t.column_id) return null;
    const k = (columnsById[t.column_id]?.kind ?? "custom") as ColumnKind;
    return k === "custom" ? "todo" : k;
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const from = findContainer(String(active.id));
    const to = findContainer(String(over.id));
    if (!from || !to || from === to) return;
    // optimistic: replace column to a representative one
    setTasks((prev) => prev.map((t) => {
      if (t.id !== active.id) return t;
      // find any column in same project with matching kind
      const tCol = t.column_id ? columnsById[t.column_id] : null;
      const projectId = tCol?.project_id ?? t.project_id;
      if (!projectId) return t;
      const target = Object.values(columnsById).find((c) => c.project_id === projectId && c.kind === to);
      return target ? { ...t, column_id: target.id } : t;
    }));
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const kind = findContainer(String(over.id));
    if (!kind) return;
    const { error } = await supabase.rpc("move_task_to_kind", { _task_id: String(active.id), _kind: kind });
    if (error) toast.error(error.message);
    await load();
  };

  const openTaskDialog = async (t: Task) => {
    setOpenTask(t);
    if (!t.project_id) return;
    const [{ data: cols }, { data: ms }] = await Promise.all([
      supabase.from("project_columns").select("*").eq("project_id", t.project_id).order("position"),
      supabase.from("project_members").select("user_id").eq("project_id", t.project_id),
    ]);
    setColumnsForOpen((cols ?? []) as ProjectColumn[]);
    const ids = ((ms ?? []) as { user_id: string }[]).map((m) => m.user_id);
    if (ids.length) {
      const { data: ps } = await supabase.from("profiles").select("id, display_name, email, avatar_url").in("id", ids);
      setMembersForOpen((ps ?? []) as Profile[]);
    } else setMembersForOpen([]);
  };

  return (
    <div className="flex flex-col">
      <div className="px-6 pt-6 pb-3">
        <h1 className="text-2xl font-bold tracking-tight">Meu Kanban</h1>
        <p className="text-sm text-muted-foreground">Tarefas em que você é responsável, agrupadas por status. Mover aqui atualiza o Kanban do projeto.</p>
      </div>
      <div className="flex-1 overflow-x-auto">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
          <div className="flex gap-4 px-6 pb-6 min-w-max">
            {PERSONAL_COLUMNS.map((pc) => {
              const items = grouped[pc.kind];
              const fakeCol: ProjectColumn = {
                id: pc.kind, project_id: "", label: pc.label, position: 0, color: pc.color,
                is_in_progress: pc.kind === "in_progress", kind: pc.kind,
              };
              return (
                <Column key={pc.kind} column={fakeCol} count={items.length}>
                  <SortableContext items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                    {items.map((t) => (
                      <div key={t.id} className="space-y-1">
                        {t.project_id && projectsById[t.project_id] && (
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pl-1">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: projectsById[t.project_id].color }} />
                            <span className="truncate">{projectsById[t.project_id].name}</span>
                          </div>
                        )}
                        <TaskCardView
                          task={t}
                          assignees={assigneesByTask[t.id]}
                          openEntry={openEntries[t.id] ?? null}
                          isDone={pc.kind === "done"}
                          onOpen={() => openTaskDialog(t)}
                        />
                      </div>
                    ))}
                  </SortableContext>
                </Column>
              );
            })}
          </div>
          <DragOverlay>{active ? <TaskCardView task={active} assignees={assigneesByTask[active.id]} openEntry={openEntries[active.id] ?? null} dragging /> : null}</DragOverlay>
        </DndContext>
      </div>

      {openTask && (
        <TaskDialog
          task={openTask}
          columns={columnsForOpen}
          members={membersForOpen}
          assignees={assigneesByTask[openTask.id] ?? []}
          openEntry={openEntries[openTask.id] ?? null}
          onClose={() => setOpenTask(null)}
          onChange={(t) => setOpenTask(t)}
          onDeleted={() => { setOpenTask(null); load(); }}
        />
      )}
    </div>
  );
}
