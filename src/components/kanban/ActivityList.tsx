import { useEffect, useState } from "react";
import { Activity, ArrowRight, UserPlus, UserMinus, MessageSquare, Paperclip, Plus, Calendar as CalIcon, Pencil } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import type { Profile, TaskActivity } from "./types";

function iconFor(action: string) {
  switch (action) {
    case "created": return <Plus className="h-3.5 w-3.5" />;
    case "moved": return <ArrowRight className="h-3.5 w-3.5" />;
    case "renamed": return <Pencil className="h-3.5 w-3.5" />;
    case "due_date_changed": return <CalIcon className="h-3.5 w-3.5" />;
    case "assignee_added": return <UserPlus className="h-3.5 w-3.5" />;
    case "assignee_removed": return <UserMinus className="h-3.5 w-3.5" />;
    case "commented": return <MessageSquare className="h-3.5 w-3.5" />;
    case "attached": return <Paperclip className="h-3.5 w-3.5" />;
    default: return <Activity className="h-3.5 w-3.5" />;
  }
}

function describe(a: TaskActivity, profiles: Record<string, Profile>): string {
  const m = (a.metadata ?? {}) as Record<string, unknown>;
  const targetId = m.target_user_id as string | undefined;
  const targetName = targetId ? (profiles[targetId]?.display_name || profiles[targetId]?.email || "alguém") : "";
  switch (a.action) {
    case "created": return "criou esta tarefa";
    case "moved": return `moveu de "${(m.from_label as string) ?? "?"}" para "${(m.to_label as string) ?? "?"}"`;
    case "renamed": return `renomeou: "${m.from as string}" → "${m.to as string}"`;
    case "due_date_changed": {
      const to = m.to as string | null;
      const from = m.from as string | null;
      if (!to) return "removeu o prazo";
      if (!from) return `definiu o prazo para ${format(new Date(to), "dd MMM yyyy", { locale: ptBR })}`;
      return `alterou o prazo para ${format(new Date(to), "dd MMM yyyy", { locale: ptBR })}`;
    }
    case "assignee_added": return `atribuiu a ${targetName}`;
    case "assignee_removed": return `removeu ${targetName} dos responsáveis`;
    case "commented": return "comentou";
    case "attached": return `anexou "${(m.name as string) ?? "arquivo"}"`;
    default: return a.action;
  }
}

export function ActivityList({ taskId }: { taskId: string }) {
  const [items, setItems] = useState<TaskActivity[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});

  const load = async () => {
    const { data } = await supabase
      .from("task_activities")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(100);
    const list = (data ?? []) as TaskActivity[];
    setItems(list);
    const ids = new Set<string>();
    list.forEach((a) => {
      if (a.user_id) ids.add(a.user_id);
      const t = (a.metadata as Record<string, unknown> | null)?.target_user_id;
      if (typeof t === "string") ids.add(t);
    });
    if (ids.size) {
      const { data: ps } = await supabase.from("profiles").select("id, display_name, email").in("id", Array.from(ids));
      const map: Record<string, Profile> = {};
      (ps ?? []).forEach((p) => { map[p.id] = p as Profile; });
      setProfiles(map);
    }
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`activity-${taskId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "task_activities", filter: `task_id=eq.${taskId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma atividade ainda.</p>;
  }

  return (
    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
      {items.map((a) => {
        const actor = a.user_id ? profiles[a.user_id] : null;
        const name = actor?.display_name || actor?.email || "Sistema";
        return (
          <div key={a.id} className="flex items-start gap-2 text-xs">
            <div className="mt-0.5 h-6 w-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center shrink-0">
              {iconFor(a.action)}
            </div>
            <div className="flex-1 min-w-0 leading-snug">
              <span className="font-medium text-foreground">{name}</span>{" "}
              <span className="text-muted-foreground">{describe(a, profiles)}</span>
              <div className="text-[11px] text-muted-foreground/80">
                {format(new Date(a.created_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
