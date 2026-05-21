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
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, LogOut, Plus, Users, Settings2 } from "lucide-react";
import { Column } from "./Column";
import { TaskCardView } from "./TaskCard";
import { TaskDialog } from "./TaskDialog";
import { MembersDialog } from "./MembersDialog";
import { ColumnsDialog } from "./ColumnsDialog";
import type { Project, ProjectColumn, Task, Profile, TaskTimeEntry } from "./types";

export function KanbanBoard({ projectId }: { projectId: string }) {
  const { user, signOut } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [columns, setColumns] = useState<ProjectColumn[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assigneesByTask, setAssigneesByTask] = useState<Record<string, Profile[]>>({});
  const [openEntries, setOpenEntries] = useState<Record<string, TaskTimeEntry>>({});
  const [members, setMembers] = useState<Profile[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColumnId, setNewColumnId] = useState<string>("");
  const [membersOpen, setMembersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const sortedColumns = useMemo(() => [...columns].sort((a, b) => a.position - b.position), [columns]);

  const loadProject = async () => {
    const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
    if (error) return toast.error(error.message);
    setProject((data as Project) ?? null);
  };

  const loadColumns = async () => {
    const { data, error } = await supabase
      .from("project_columns")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true });
    if (error) return toast.error(error.message);
    const list = (data ?? []) as ProjectColumn[];
    setColumns(list);
    if (!newColumnId && list.length) setNewColumnId(list[0].id);
  };

  const loadMembers = async () => {
    const { data: ms } = await supabase
      .from("project_members")
      .select("user_id, role")
      .eq("project_id", projectId);
    const list = (ms ?? []) as { user_id: string; role: "owner" | "member" }[];
    setIsOwner(list.some((m) => m.user_id === user?.id && m.role === "owner"));
    if (list.length) {
      const { data: ps } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", list.map((m) => m.user_id));
      setMembers((ps ?? []) as Profile[]);
    }
  };

  const loadTasks = async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true });
    if (error) return toast.error(error.message);
    const list = (data ?? []) as unknown as Task[];
    setTasks(list);
    if (list.length) {
      const ids = list.map((t) => t.id);
      const [{ data: aData }, { data: eData }] = await Promise.all([
        supabase.from("task_assignees").select("task_id, user_id").in("task_id", ids),
        supabase.from("task_time_entries").select("*").in("task_id", ids).is("ended_at", null),
      ]);
      const assignees = (aData ?? []) as { task_id: string; user_id: string }[];
      const userIds = Array.from(new Set(assignees.map((a) => a.user_id)));
      let profMap: Record<string, Profile> = {};
      if (userIds.length) {
        const { data: ps } = await supabase.from("profiles").select("id, display_name, email").in("id", userIds);
        (ps ?? []).forEach((p) => { profMap[p.id] = p as Profile; });
      }
      const map: Record<string, Profile[]> = {};
      assignees.forEach((a) => {
        if (!map[a.task_id]) map[a.task_id] = [];
        if (profMap[a.user_id]) map[a.task_id].push(profMap[a.user_id]);
      });
      setAssigneesByTask(map);

      const entriesMap: Record<string, TaskTimeEntry> = {};
      ((eData ?? []) as TaskTimeEntry[]).forEach((e) => { entriesMap[e.task_id] = e; });
      setOpenEntries(entriesMap);
    } else {
      setAssigneesByTask({});
      setOpenEntries({});
    }
  };

  useEffect(() => {
    loadProject();
    loadColumns();
    loadMembers();
    loadTasks();
    const ch = supabase
      .channel(`board-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` }, () => loadTasks())
      .on("postgres_changes", { event: "*", schema: "public", table: "project_columns", filter: `project_id=eq.${projectId}` }, () => loadColumns())
      .on("postgres_changes", { event: "*", schema: "public", table: "project_members", filter: `project_id=eq.${projectId}` }, () => loadMembers())
      .on("postgres_changes", { event: "*", schema: "public", table: "task_assignees" }, () => loadTasks())
      .on("postgres_changes", { event: "*", schema: "public", table: "task_time_entries" }, () => loadTasks())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const grouped = useMemo(() => {
    const g: Record<string, Task[]> = {};
    sortedColumns.forEach((c) => { g[c.id] = []; });
    for (const t of tasks) {
      if (t.column_id && g[t.column_id]) g[t.column_id].push(t);
    }
    return g;
  }, [tasks, sortedColumns]);

  const active = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;

  const findContainer = (id: string): string | null => {
    if (id.startsWith("col:")) return id.slice(4);
    const t = tasks.find((x) => x.id === id);
    return t?.column_id ?? null;
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const from = findContainer(String(active.id));
    const to = findContainer(String(over.id));
    if (!from || !to || from === to) return;
    setTasks((prev) => prev.map((t) => (t.id === active.id ? { ...t, column_id: to } : t)));
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    const targetCol = findContainer(overIdStr);
    if (!targetCol) return;

    const colItems = tasks.filter((t) => t.column_id === targetCol).map((t) => t.id);
    const oldIndex = colItems.indexOf(activeIdStr);
    const newIndex = overIdStr.startsWith("col:")
      ? colItems.length - 1
      : colItems.indexOf(overIdStr);
    let nextOrder = colItems;
    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      nextOrder = arrayMove(colItems, oldIndex, newIndex);
    }

    const updated = tasks.map((t) => {
      if (t.column_id !== targetCol) return t;
      const idx = nextOrder.indexOf(t.id);
      return { ...t, position: idx };
    });
    setTasks(updated);

    const updates = updated
      .filter((t) => t.column_id === targetCol)
      .map((t) =>
        supabase.from("tasks").update({ column_id: t.column_id, position: t.position }).eq("id", t.id)
      );
    const results = await Promise.all(updates);
    const err = results.find((r) => r.error);
    if (err?.error) toast.error(err.error.message);
  };

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTitle.trim() || !newColumnId) return;
    const colTasks = grouped[newColumnId] ?? [];
    const pos = (colTasks.at(-1)?.position ?? -1) + 1;
    const { error } = await supabase.from("tasks").insert({
      title: newTitle.trim(),
      description: newDesc,
      column_id: newColumnId,
      position: pos,
      created_by: user.id,
      project_id: projectId,
    });
    if (error) return toast.error(error.message);
    setNewTitle(""); setNewDesc(""); setNewOpen(false);
    toast.success("Tarefa criada");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/projects" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2 font-semibold min-w-0">
              <span className="h-3 w-3 rounded-full shrink-0" style={{ background: project?.color ?? "var(--primary)" }} />
              <span className="truncate">{project?.name ?? "Projeto"}</span>
              {project?.client && (
                <span className="text-xs font-normal text-muted-foreground truncate">· {project.client}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setMembersOpen(true)}>
              <Users className="h-4 w-4 mr-1" /> Membros
            </Button>
            <Button size="sm" variant="outline" onClick={() => setColumnsOpen(true)}>
              <Settings2 className="h-4 w-4 mr-1" /> Colunas
            </Button>
            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova tarefa</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Nova tarefa</DialogTitle></DialogHeader>
                <form onSubmit={createTask} className="space-y-3">
                  <div>
                    <Label htmlFor="t">Título</Label>
                    <Input id="t" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="d">Descrição</Label>
                    <Textarea id="d" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={3} />
                  </div>
                  <div>
                    <Label>Coluna</Label>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {sortedColumns.map((c) => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => setNewColumnId(c.id)}
                          className={`text-xs px-3 py-1 rounded-full border transition ${
                            newColumnId === c.id ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={() => setNewOpen(false)}>Cancelar</Button>
                    <Button type="submit">Criar</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            <div className="text-xs text-muted-foreground hidden sm:block">{user?.email}</div>
            <Button size="sm" variant="ghost" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-x-auto">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
          <div className="flex gap-4 p-6 min-w-max h-[calc(100vh-3.5rem)]">
            {sortedColumns.map((col) => {
              const items = grouped[col.id] ?? [];
              const isDoneCol = col.position === Math.max(...sortedColumns.map((c) => c.position));
              return (
                <Column key={col.id} column={col} count={items.length}>
                  <SortableContext items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                    {items.map((t) => (
                      <TaskCardView
                        key={t.id}
                        task={t}
                        assignees={assigneesByTask[t.id]}
                        openEntry={openEntries[t.id] ?? null}
                        isDone={isDoneCol}
                        onOpen={() => setOpenTask(t)}
                      />
                    ))}
                  </SortableContext>
                </Column>
              );
            })}
          </div>
          <DragOverlay>{active ? <TaskCardView task={active} assignees={assigneesByTask[active.id]} openEntry={openEntries[active.id] ?? null} dragging /> : null}</DragOverlay>
        </DndContext>
      </main>

      {openTask && (
        <TaskDialog
          task={openTask}
          columns={sortedColumns}
          members={members}
          assignees={assigneesByTask[openTask.id] ?? []}
          openEntry={openEntries[openTask.id] ?? null}
          onClose={() => setOpenTask(null)}
          onChange={(t) => setOpenTask(t)}
          onDeleted={() => { setOpenTask(null); loadTasks(); }}
        />
      )}

      <MembersDialog projectId={projectId} isOwner={isOwner} open={membersOpen} onClose={() => setMembersOpen(false)} />
      <ColumnsDialog projectId={projectId} columns={columns} isOwner={isOwner} open={columnsOpen} onClose={() => setColumnsOpen(false)} />
    </div>
  );
}
