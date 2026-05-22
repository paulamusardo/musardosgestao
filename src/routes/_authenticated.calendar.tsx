import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskDialog } from "@/components/kanban/TaskDialog";
import type { Task, Project, ProjectColumn, Profile, TaskTimeEntry } from "@/components/kanban/types";

export const Route = createFileRoute("/_authenticated/calendar")({ component: CalendarPage });

function CalendarPage() {
  const { user } = useAuth();
  const [cursor, setCursor] = useState(new Date());
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectsById, setProjectsById] = useState<Record<string, Project>>({});
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [columnsForOpen, setColumnsForOpen] = useState<ProjectColumn[]>([]);
  const [membersForOpen, setMembersForOpen] = useState<Profile[]>([]);
  const [assigneesForOpen, setAssigneesForOpen] = useState<Profile[]>([]);
  const [entryForOpen, setEntryForOpen] = useState<TaskTimeEntry | null>(null);

  const load = async () => {
    if (!user) return;
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    let taskIds: string[] | null = null;
    if (scope === "mine") {
      const { data: myA } = await supabase.from("task_assignees").select("task_id").eq("user_id", user.id);
      taskIds = ((myA ?? []) as { task_id: string }[]).map((x) => x.task_id);
      if (!taskIds.length) { setTasks([]); return; }
    }
    let q = supabase.from("tasks").select("*")
      .not("due_date", "is", null)
      .gte("due_date", start.toISOString())
      .lte("due_date", end.toISOString());
    if (taskIds) q = q.in("id", taskIds);
    const { data } = await q;
    const list = ((data ?? []) as unknown) as Task[];
    setTasks(list);
    const projIds = Array.from(new Set(list.map((t) => t.project_id).filter(Boolean) as string[]));
    if (projIds.length) {
      const { data: ps } = await supabase.from("projects").select("*").in("id", projIds);
      const map: Record<string, Project> = {};
      ((ps ?? []) as Project[]).forEach((p) => { map[p.id] = p; });
      setProjectsById(map);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [cursor, scope, user?.id]);
  useEffect(() => {
    const ch = supabase.channel("cal-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_assignees" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [cursor, scope]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    const out: Date[] = [];
    for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) out.push(new Date(d));
    return out;
  }, [cursor]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const k = format(new Date(t.due_date), "yyyy-MM-dd");
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return map;
  }, [tasks]);

  const openDialog = async (t: Task) => {
    setOpenTask(t);
    if (!t.project_id) return;
    const [{ data: cols }, { data: ms }, { data: aIds }, { data: ent }] = await Promise.all([
      supabase.from("project_columns").select("*").eq("project_id", t.project_id).order("position"),
      supabase.from("project_members").select("user_id").eq("project_id", t.project_id),
      supabase.from("task_assignees").select("user_id").eq("task_id", t.id),
      supabase.from("task_time_entries").select("*").eq("task_id", t.id).is("ended_at", null).maybeSingle(),
    ]);
    setColumnsForOpen((cols ?? []) as ProjectColumn[]);
    const memberIds = ((ms ?? []) as { user_id: string }[]).map((m) => m.user_id);
    const assigneeIds = ((aIds ?? []) as { user_id: string }[]).map((m) => m.user_id);
    const ids = Array.from(new Set([...memberIds, ...assigneeIds]));
    if (ids.length) {
      const { data: ps } = await supabase.from("profiles").select("id, display_name, email, avatar_url").in("id", ids);
      const all = (ps ?? []) as Profile[];
      setMembersForOpen(all.filter((p) => memberIds.includes(p.id)));
      setAssigneesForOpen(all.filter((p) => assigneeIds.includes(p.id)));
    }
    setEntryForOpen((ent as TaskTimeEntry | null) ?? null);
  };

  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendário</h1>
          <p className="text-sm text-muted-foreground">Prazos e entregas dia a dia.</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={scope} onValueChange={(v) => setScope(v as "mine" | "all")}>
            <TabsList>
              <TabsTrigger value="mine">Minhas</TabsTrigger>
              <TabsTrigger value="all">Todos os projetos</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-1 border rounded-md">
            <Button size="sm" variant="ghost" onClick={() => setCursor(addMonths(cursor, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="text-sm font-medium px-2 capitalize tabular-nums min-w-[10ch] text-center">
              {format(cursor, "MMMM yyyy", { locale: ptBR })}
            </div>
            <Button size="sm" variant="ghost" onClick={() => setCursor(addMonths(cursor, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>Hoje</Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {weekDays.map((d) => (
            <div key={d} className="px-2 py-2 text-xs font-medium text-muted-foreground text-center">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const k = format(d, "yyyy-MM-dd");
            const list = tasksByDay.get(k) ?? [];
            const inMonth = isSameMonth(d, cursor);
            const today = isSameDay(d, new Date());
            return (
              <div key={k} className={`min-h-[110px] border-b border-r p-1.5 text-xs ${!inMonth ? "bg-muted/20 text-muted-foreground/60" : ""}`}>
                <div className={`flex items-center justify-end mb-1 ${today ? "" : ""}`}>
                  <span className={`tabular-nums w-6 h-6 flex items-center justify-center rounded-full text-xs ${today ? "bg-primary text-primary-foreground font-semibold" : ""}`}>
                    {format(d, "d")}
                  </span>
                </div>
                <div className="space-y-1">
                  {list.slice(0, 3).map((t) => {
                    const proj = t.project_id ? projectsById[t.project_id] : null;
                    return (
                      <button
                        key={t.id}
                        onClick={() => openDialog(t)}
                        className="w-full text-left text-[11px] px-1.5 py-1 rounded truncate flex items-center gap-1.5 hover:bg-accent"
                        style={{ background: proj ? `${proj.color}1a` : undefined, color: proj?.color }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: proj?.color ?? "currentColor" }} />
                        <span className="truncate text-foreground">{t.title}</span>
                      </button>
                    );
                  })}
                  {list.length > 3 && (
                    <div className="text-[10px] text-muted-foreground pl-1">+{list.length - 3} mais</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {openTask && (
        <TaskDialog
          task={openTask}
          columns={columnsForOpen}
          members={membersForOpen}
          assignees={assigneesForOpen}
          openEntry={entryForOpen}
          onClose={() => setOpenTask(null)}
          onChange={(t) => setOpenTask(t)}
          onDeleted={() => { setOpenTask(null); load(); }}
        />
      )}
    </div>
  );
}
