import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Notification = {
  id: string;
  user_id: string;
  actor_id: string | null;
  task_id: string | null;
  project_id: string | null;
  kind: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

type Profile = { id: string; display_name: string | null; email: string | null };
type Task = { id: string; title: string };

const KIND_LABEL: Record<string, string> = {
  created: "criou a tarefa",
  moved: "moveu a tarefa",
  renamed: "renomeou a tarefa",
  due_date_changed: "alterou o prazo",
  commented: "comentou na tarefa",
  attached: "anexou um arquivo em",
  assignee_added: "adicionou um responsável em",
  assignee_removed: "removeu um responsável de",
  assigned_to_you: "atribuiu você à tarefa",
};

export function NotificationsBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [actors, setActors] = useState<Record<string, Profile>>({});
  const [tasks, setTasks] = useState<Record<string, Task>>({});
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40);
    const list = (data ?? []) as Notification[];
    setItems(list);
    const actorIds = Array.from(new Set(list.map((n) => n.actor_id).filter(Boolean) as string[]));
    const taskIds = Array.from(new Set(list.map((n) => n.task_id).filter(Boolean) as string[]));
    if (actorIds.length) {
      const { data: ps } = await supabase.from("profiles").select("id, display_name, email").in("id", actorIds);
      const m: Record<string, Profile> = {};
      (ps ?? []).forEach((p) => { m[(p as Profile).id] = p as Profile; });
      setActors(m);
    }
    if (taskIds.length) {
      const { data: ts } = await supabase.from("tasks").select("id, title").in("id", taskIds);
      const m: Record<string, Task> = {};
      (ts ?? []).forEach((t) => { m[(t as Task).id] = t as Task; });
      setTasks(m);
    }
  };

  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase
      .channel(`notifs-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const unreadCount = items.filter((n) => !n.read_at).length;

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  };

  const onClick = async (n: Notification) => {
    if (!n.read_at) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    }
    setOpen(false);
    if (n.project_id) {
      navigate({ to: "/projects/$projectId", params: { projectId: n.project_id } });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label="Notificações">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] rounded-full">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="text-sm font-semibold">Notificações</div>
          {unreadCount > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={markAllRead}>
              <CheckCheck className="h-3.5 w-3.5 mr-1" /> Marcar todas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[60vh]">
          {items.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground text-center">Sem notificações.</div>
          )}
          {items.map((n) => {
            const actor = n.actor_id ? actors[n.actor_id] : null;
            const actorName = actor?.display_name || actor?.email || "Alguém";
            const task = n.task_id ? tasks[n.task_id] : null;
            const action = KIND_LABEL[n.kind] ?? n.kind;
            return (
              <button
                key={n.id}
                onClick={() => onClick(n)}
                className={`w-full text-left px-3 py-2.5 border-b hover:bg-accent flex gap-2 ${!n.read_at ? "bg-accent/30" : ""}`}
              >
                {!n.read_at && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{actorName}</span>{" "}
                    <span className="text-muted-foreground">{action}</span>{" "}
                    {task && <span className="font-medium">{task.title}</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground" title={format(new Date(n.created_at), "PPpp", { locale: ptBR })}>
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
              </button>
            );
          })}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
