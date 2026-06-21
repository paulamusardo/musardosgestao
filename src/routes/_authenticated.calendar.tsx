import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TaskDialog } from "@/components/kanban/TaskDialog";
import type {
  Task,
  Project,
  ProjectColumn,
  Profile,
  TaskTimeEntry,
} from "@/components/kanban/types";

export const Route = createFileRoute("/_authenticated/calendar")({ component: CalendarPage });

type ViewMode = "day" | "week" | "month";

function CalendarPage() {
  const { user } = useAuth();
  const [cursor, setCursor] = useState(new Date());
  const [view, setView] = useState<ViewMode>("month");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [assigneesByTask, setAssigneesByTask] = useState<Record<string, string[]>>({});
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());
  const [includeUnassigned, setIncludeUnassigned] = useState(true);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set()); // project ids; "personal" for sem cliente

  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [columnsForOpen, setColumnsForOpen] = useState<ProjectColumn[]>([]);
  const [membersForOpen, setMembersForOpen] = useState<Profile[]>([]);
  const [assigneesForOpen, setAssigneesForOpen] = useState<Profile[]>([]);
  const [entryForOpen, setEntryForOpen] = useState<TaskTimeEntry | null>(null);
  const [dayDialog, setDayDialog] = useState<Date | null>(null);

  const range = useMemo(() => {
    if (view === "day") return { start: startOfDay(cursor), end: endOfDay(cursor) };
    if (view === "week")
      return {
        start: startOfWeek(cursor, { weekStartsOn: 0 }),
        end: endOfWeek(cursor, { weekStartsOn: 0 }),
      };
    return {
      start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 }),
      end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 }),
    };
  }, [cursor, view]);

  const load = async () => {
    if (!user) return;
    let baseIds: string[] | null = null;
    if (scope === "mine") {
      const { data: myA } = await supabase.from("task_assignees").select("task_id").eq("user_id", user.id);
      baseIds = ((myA ?? []) as { task_id: string }[]).map((x) => x.task_id);
      if (!baseIds.length) {
        setTasks([]);
        setAssigneesByTask({});
        setPeople([]);
        setProjects([]);
        return;
      }
    }
    let q = supabase
      .from("tasks")
      .select("*")
      .not("due_date", "is", null)
      .gte("due_date", range.start.toISOString())
      .lte("due_date", range.end.toISOString());
    if (baseIds) q = q.in("id", baseIds);
    const { data } = await q;
    const list = ((data ?? []) as unknown) as Task[];
    setTasks(list);

    const projIds = Array.from(new Set(list.map((t) => t.project_id).filter(Boolean) as string[]));
    if (projIds.length) {
      const { data: ps } = await supabase.from("projects").select("*").in("id", projIds);
      setProjects((ps ?? []) as Project[]);
    } else {
      setProjects([]);
    }

    const taskIds = list.map((t) => t.id);
    if (taskIds.length) {
      const { data: a } = await supabase.from("task_assignees").select("task_id, user_id").in("task_id", taskIds);
      const map: Record<string, string[]> = {};
      const userIds = new Set<string>();
      ((a ?? []) as { task_id: string; user_id: string }[]).forEach((row) => {
        if (!map[row.task_id]) map[row.task_id] = [];
        map[row.task_id].push(row.user_id);
        userIds.add(row.user_id);
      });
      setAssigneesByTask(map);
      if (userIds.size) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, email, avatar_url")
          .in("id", Array.from(userIds));
        setPeople((profs ?? []) as Profile[]);
      } else {
        setPeople([]);
      }
    } else {
      setAssigneesByTask({});
      setPeople([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start.getTime(), range.end.getTime(), scope, user?.id]);

  useEffect(() => {
    const ch = supabase
      .channel(`cal-rt-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_assignees" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start.getTime(), range.end.getTime(), scope]);

  const projectsById = useMemo(() => {
    const m: Record<string, Project> = {};
    projects.forEach((p) => (m[p.id] = p));
    return m;
  }, [projects]);

  // Distinct clients
  const clients = useMemo(() => {
    const m = new Map<string, { key: string; label: string; color: string }>();
    projects.forEach((p) => {
      const key = p.client?.trim() ? `client:${p.client.trim()}` : `project:${p.id}`;
      const label = p.client?.trim() || p.name;
      if (!m.has(key)) m.set(key, { key, label, color: p.color });
    });
    return Array.from(m.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [projects]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const aids = assigneesByTask[t.id] ?? [];
      // people filter
      if (selectedPeople.size > 0 || !includeUnassigned) {
        const matchesPerson = aids.some((id) => selectedPeople.has(id));
        const isUnassigned = aids.length === 0;
        if (!matchesPerson && !(isUnassigned && includeUnassigned)) return false;
      }
      // clients filter
      if (selectedClients.size > 0) {
        if (!t.project_id) {
          if (!selectedClients.has("personal")) return false;
        } else {
          const proj = projectsById[t.project_id];
          if (!proj) return false;
          const key = proj.client?.trim() ? `client:${proj.client.trim()}` : `project:${proj.id}`;
          if (!selectedClients.has(key)) return false;
        }
      }
      return true;
    });
  }, [tasks, assigneesByTask, selectedPeople, includeUnassigned, selectedClients, projectsById]);

  const tasksByDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of filteredTasks) {
      if (!t.due_date) continue;
      const k = format(new Date(t.due_date), "yyyy-MM-dd");
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    return m;
  }, [filteredTasks]);

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
      const { data: ps } = await supabase
        .from("profiles")
        .select("id, display_name, email, avatar_url")
        .in("id", ids);
      const all = (ps ?? []) as Profile[];
      setMembersForOpen(all.filter((p) => memberIds.includes(p.id)));
      setAssigneesForOpen(all.filter((p) => assigneeIds.includes(p.id)));
    }
    setEntryForOpen((ent as TaskTimeEntry | null) ?? null);
  };

  const goPrev = () =>
    setCursor(view === "day" ? addDays(cursor, -1) : view === "week" ? addWeeks(cursor, -1) : addMonths(cursor, -1));
  const goNext = () =>
    setCursor(view === "day" ? addDays(cursor, 1) : view === "week" ? addWeeks(cursor, 1) : addMonths(cursor, 1));

  const headerLabel = useMemo(() => {
    if (view === "day") return format(cursor, "EEEE, dd 'de' MMMM yyyy", { locale: ptBR });
    if (view === "week") {
      const s = startOfWeek(cursor, { weekStartsOn: 0 });
      const e = endOfWeek(cursor, { weekStartsOn: 0 });
      return `${format(s, "dd MMM", { locale: ptBR })} – ${format(e, "dd MMM yyyy", { locale: ptBR })}`;
    }
    return format(cursor, "MMMM yyyy", { locale: ptBR });
  }, [cursor, view]);

  const togglePerson = (id: string) => {
    setSelectedPeople((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleClient = (key: string) => {
    setSelectedClients((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  const hasPersonalTasks = tasks.some((t) => !t.project_id);
  const activeFiltersCount =
    selectedPeople.size + (includeUnassigned ? 0 : 1) + selectedClients.size;

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendário</h1>
          <p className="text-sm text-muted-foreground">Prazos e entregas por dia, semana ou mês.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="day">Dia</TabsTrigger>
              <TabsTrigger value="week">Semana</TabsTrigger>
              <TabsTrigger value="month">Mês</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={scope} onValueChange={(v) => setScope(v as "mine" | "all")}>
            <TabsList>
              <TabsTrigger value="mine">Minhas</TabsTrigger>
              <TabsTrigger value="all">Todos</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-1 border rounded-md">
            <Button size="sm" variant="ghost" onClick={goPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium px-2 capitalize tabular-nums min-w-[14ch] text-center">
              {headerLabel}
            </div>
            <Button size="sm" variant="ghost" onClick={goNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>
            Hoje
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline">
              Pessoas
              {selectedPeople.size > 0 && (
                <Badge variant="secondary" className="ml-2">{selectedPeople.size}</Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2">
            <ScrollArea className="max-h-72">
              <button
                onClick={() => setIncludeUnassigned((v) => !v)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent text-sm"
              >
                <div className="h-4 w-4 rounded border flex items-center justify-center">
                  {includeUnassigned && <Check className="h-3 w-3" />}
                </div>
                <span className="italic text-muted-foreground">Sem responsável</span>
              </button>
              <div className="h-px bg-border my-1" />
              {people.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma pessoa nas tarefas</div>
              )}
              {people.map((p) => {
                const checked = selectedPeople.has(p.id);
                const name = p.display_name || p.email || "Usuário";
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePerson(p.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent text-sm"
                  >
                    <div className="h-4 w-4 rounded border flex items-center justify-center">
                      {checked && <Check className="h-3 w-3" />}
                    </div>
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                    ) : (
                      <div className="h-5 w-5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center">
                        {name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="truncate">{name}</span>
                  </button>
                );
              })}
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline">
              Clientes
              {selectedClients.size > 0 && (
                <Badge variant="secondary" className="ml-2">{selectedClients.size}</Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2">
            <ScrollArea className="max-h-72">
              {hasPersonalTasks && (
                <button
                  onClick={() => toggleClient("personal")}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent text-sm"
                >
                  <div className="h-4 w-4 rounded border flex items-center justify-center">
                    {selectedClients.has("personal") && <Check className="h-3 w-3" />}
                  </div>
                  <span className="italic text-muted-foreground">Pessoal (sem cliente)</span>
                </button>
              )}
              {clients.length === 0 && !hasPersonalTasks && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum cliente no período</div>
              )}
              {clients.map((c) => {
                const checked = selectedClients.has(c.key);
                return (
                  <button
                    key={c.key}
                    onClick={() => toggleClient(c.key)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent text-sm"
                  >
                    <div className="h-4 w-4 rounded border flex items-center justify-center">
                      {checked && <Check className="h-3 w-3" />}
                    </div>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                    <span className="truncate">{c.label}</span>
                  </button>
                );
              })}
            </ScrollArea>
          </PopoverContent>
        </Popover>

        {activeFiltersCount > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedPeople(new Set());
              setSelectedClients(new Set());
              setIncludeUnassigned(true);
            }}
          >
            Limpar filtros
          </Button>
        )}
        <div className="text-xs text-muted-foreground ml-auto">
          {filteredTasks.length} de {tasks.length} tarefas
        </div>
      </div>

      {view === "month" && (
        <MonthGrid cursor={cursor} tasksByDay={tasksByDay} projectsById={projectsById} onOpen={openDialog} onOpenDay={(d) => setDayDialog(d)} />
      )}
      {view === "week" && (
        <WeekGrid cursor={cursor} tasksByDay={tasksByDay} projectsById={projectsById} onOpen={openDialog} onOpenDay={(d) => setDayDialog(d)} />
      )}
      {view === "day" && (
        <DayList date={cursor} tasks={tasksByDay.get(format(cursor, "yyyy-MM-dd")) ?? []} projectsById={projectsById} onOpen={openDialog} />
      )}

      {dayDialog && (
        <Dialog open onOpenChange={(o) => !o && setDayDialog(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="capitalize">
                {format(dayDialog, "EEEE, dd 'de' MMMM yyyy", { locale: ptBR })}
              </DialogTitle>
            </DialogHeader>
            <DayList
              date={dayDialog}
              tasks={tasksByDay.get(format(dayDialog, "yyyy-MM-dd")) ?? []}
              projectsById={projectsById}
              onOpen={(t) => { setDayDialog(null); openDialog(t); }}
              hideHeader
            />
          </DialogContent>
        </Dialog>
      )}

      {openTask && (
        <TaskDialog
          task={openTask}
          columns={columnsForOpen}
          members={membersForOpen}
          assignees={assigneesForOpen}
          openEntry={entryForOpen}
          onClose={() => setOpenTask(null)}
          onChange={(t) => setOpenTask(t)}
          onDeleted={() => {
            setOpenTask(null);
            load();
          }}
        />
      )}
    </div>
  );
}

const weekDayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function TaskChip({ t, projectsById, onOpen }: { t: Task; projectsById: Record<string, Project>; onOpen: (t: Task) => void }) {
  const proj = t.project_id ? projectsById[t.project_id] : null;
  return (
    <button
      onClick={() => onOpen(t)}
      className="w-full text-left text-[11px] px-1.5 py-1 rounded truncate flex items-center gap-1.5 hover:bg-accent"
      style={{ background: proj ? `${proj.color}1a` : undefined }}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: proj?.color ?? "hsl(var(--muted-foreground))" }} />
      <span className="truncate text-foreground">{t.title}</span>
    </button>
  );
}

function MonthGrid({
  cursor,
  tasksByDay,
  projectsById,
  onOpen,
  onOpenDay,
}: {
  cursor: Date;
  tasksByDay: Map<string, Task[]>;
  projectsById: Record<string, Project>;
  onOpen: (t: Task) => void;
  onOpenDay: (d: Date) => void;
}) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    const out: Date[] = [];
    for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) out.push(new Date(d));
    return out;
  }, [cursor]);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="grid grid-cols-7 border-b bg-muted/40">
        {weekDayLabels.map((d) => (
          <div key={d} className="px-2 py-2 text-xs font-medium text-muted-foreground text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const k = format(d, "yyyy-MM-dd");
          const list = tasksByDay.get(k) ?? [];
          const inMonth = isSameMonth(d, cursor);
          const today = isSameDay(d, new Date());
          return (
            <div
              key={k}
              onClick={() => list.length > 0 && onOpenDay(d)}
              className={`min-h-[110px] border-b border-r p-1.5 text-xs ${!inMonth ? "bg-muted/20 text-muted-foreground/60" : ""} ${list.length > 0 ? "cursor-pointer hover:bg-accent/40" : ""}`}
            >
              <div className="flex items-center justify-end mb-1">
                <span
                  className={`tabular-nums w-6 h-6 flex items-center justify-center rounded-full text-xs ${
                    today ? "bg-primary text-primary-foreground font-semibold" : ""
                  }`}
                >
                  {format(d, "d")}
                </span>
              </div>
              <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                {list.slice(0, 3).map((t) => (
                  <TaskChip key={t.id} t={t} projectsById={projectsById} onOpen={onOpen} />
                ))}
                {list.length > 3 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenDay(d); }}
                    className="text-[10px] text-primary hover:underline pl-1"
                  >
                    +{list.length - 3} mais — ver todas
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({
  cursor,
  tasksByDay,
  projectsById,
  onOpen,
  onOpenDay,
}: {
  cursor: Date;
  tasksByDay: Map<string, Task[]>;
  projectsById: Record<string, Project>;
  onOpen: (t: Task) => void;
  onOpenDay: (d: Date) => void;
}) {
  const days = useMemo(() => {
    const s = startOfWeek(cursor, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [cursor]);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="grid grid-cols-7 border-b bg-muted/40">
        {days.map((d, i) => {
          const today = isSameDay(d, new Date());
          return (
            <div key={i} className="px-2 py-2 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{weekDayLabels[i]}</div>
              <div className={`text-sm font-semibold tabular-nums ${today ? "text-primary" : ""}`}>{format(d, "dd")}</div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-7 min-h-[420px]">
        {days.map((d) => {
          const k = format(d, "yyyy-MM-dd");
          const list = tasksByDay.get(k) ?? [];
          return (
            <div key={k} className="border-r p-2 space-y-1">
              {list.length === 0 && <div className="text-[11px] text-muted-foreground/60">—</div>}
              {list.map((t) => (
                <TaskChip key={t.id} t={t} projectsById={projectsById} onOpen={onOpen} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayList({
  date,
  tasks,
  projectsById,
  onOpen,
}: {
  date: Date;
  tasks: Task[];
  projectsById: Record<string, Project>;
  onOpen: (t: Task) => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm text-muted-foreground mb-3 capitalize">
        {format(date, "EEEE, dd 'de' MMMM", { locale: ptBR })}
      </div>
      {tasks.length === 0 && (
        <div className="text-sm text-muted-foreground py-12 text-center">Nenhuma tarefa para este dia.</div>
      )}
      <div className="space-y-2">
        {tasks.map((t) => {
          const proj = t.project_id ? projectsById[t.project_id] : null;
          return (
            <button
              key={t.id}
              onClick={() => onOpen(t)}
              className="w-full text-left px-3 py-2.5 rounded-lg border hover:bg-accent flex items-center gap-3"
            >
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: proj?.color ?? "hsl(var(--muted-foreground))" }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{t.title}</div>
                {proj && (
                  <div className="text-xs text-muted-foreground truncate">
                    {proj.client ? `${proj.client} · ` : ""}
                    {proj.name}
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {format(new Date(t.due_date!), "HH:mm")}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
