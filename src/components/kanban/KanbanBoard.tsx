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
import { ArrowLeft, KanbanSquare, LogOut, Plus } from "lucide-react";
import { Column } from "./Column";
import { TaskCardView } from "./TaskCard";
import { TaskDialog } from "./TaskDialog";
import type { Project, Task, TaskStatus } from "./types";
import { COLUMNS } from "./types";

export function KanbanBoard({ projectId }: { projectId: string }) {
  const { user, signOut } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newStatus, setNewStatus] = useState<TaskStatus>("todo");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const loadProject = async () => {
    const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
    if (error) return toast.error(error.message);
    setProject((data as Project) ?? null);
  };

  const load = async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true });
    if (error) return toast.error(error.message);
    setTasks((data ?? []) as Task[]);
  };

  useEffect(() => {
    loadProject();
    load();
    const ch = supabase
      .channel(`tasks-rt-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const grouped = useMemo(() => {
    const g: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], review: [], done: [] };
    for (const t of tasks) g[t.status].push(t);
    return g;
  }, [tasks]);

  const active = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;

  const findContainer = (id: string): TaskStatus | null => {
    if (COLUMNS.some((c) => c.key === id)) return id as TaskStatus;
    const t = tasks.find((x) => x.id === id);
    return t ? t.status : null;
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const from = findContainer(String(active.id));
    const to = findContainer(String(over.id));
    if (!from || !to || from === to) return;
    setTasks((prev) => prev.map((t) => (t.id === active.id ? { ...t, status: to } : t)));
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    const targetCol = findContainer(overIdStr);
    if (!targetCol) return;

    const colItems = tasks.filter((t) => t.status === targetCol).map((t) => t.id);
    const oldIndex = colItems.indexOf(activeIdStr);
    const newIndex = COLUMNS.some((c) => c.key === overIdStr)
      ? colItems.length - 1
      : colItems.indexOf(overIdStr);
    let nextOrder = colItems;
    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      nextOrder = arrayMove(colItems, oldIndex, newIndex);
    }

    const updated = tasks.map((t) => {
      if (t.status !== targetCol) return t;
      const idx = nextOrder.indexOf(t.id);
      return { ...t, position: idx };
    });
    setTasks(updated);

    const moved = updated.find((t) => t.id === activeIdStr);
    if (!moved) return;
    const updates = updated
      .filter((t) => t.status === targetCol)
      .map((t) =>
        supabase.from("tasks").update({ status: t.status, position: t.position }).eq("id", t.id)
      );
    const results = await Promise.all(updates);
    const err = results.find((r) => r.error);
    if (err?.error) toast.error(err.error.message);
  };

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTitle.trim()) return;
    const pos = (grouped[newStatus].at(-1)?.position ?? -1) + 1;
    const { error } = await supabase.from("tasks").insert({
      title: newTitle.trim(),
      description: newDesc,
      status: newStatus,
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
              <span
                className="h-3 w-3 rounded-full shrink-0"
                style={{ background: project?.color ?? "var(--primary)" }}
              />
              <span className="truncate">{project?.name ?? "Projeto"}</span>
              {project?.client && (
                <span className="text-xs font-normal text-muted-foreground truncate">· {project.client}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
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
                      {COLUMNS.map((c) => (
                        <button
                          type="button"
                          key={c.key}
                          onClick={() => setNewStatus(c.key)}
                          className={`text-xs px-3 py-1 rounded-full border transition ${
                            newStatus === c.key ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground"
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
            {COLUMNS.map((col) => (
              <Column key={col.key} column={col} items={grouped[col.key]}>
                <SortableContext items={grouped[col.key].map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  {grouped[col.key].map((t) => (
                    <TaskCardView key={t.id} task={t} onOpen={() => setOpenTask(t)} />
                  ))}
                </SortableContext>
              </Column>
            ))}
          </div>
          <DragOverlay>{active ? <TaskCardView task={active} dragging /> : null}</DragOverlay>
        </DndContext>
      </main>

      {openTask && (
        <TaskDialog
          task={openTask}
          onClose={() => setOpenTask(null)}
          onChange={(t) => setOpenTask(t)}
          onDeleted={() => { setOpenTask(null); load(); }}
        />
      )}
    </div>
  );
}
