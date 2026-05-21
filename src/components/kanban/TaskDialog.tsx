import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalIcon, Trash2, Send } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { COLUMNS, type Task, type Comment, type TaskStatus } from "./types";

type Profile = { id: string; display_name: string | null; email: string | null };

export function TaskDialog({
  task,
  onClose,
  onChange,
  onDeleted,
}: {
  task: Task;
  onClose: () => void;
  onChange: (t: Task) => void;
  onDeleted: () => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [due, setDue] = useState<Date | undefined>(task.due_date ? new Date(task.due_date) : undefined);
  const [comments, setComments] = useState<Comment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [newComment, setNewComment] = useState("");

  useEffect(() => {
    setTitle(task.title);
    setDesc(task.description ?? "");
    setStatus(task.status);
    setDue(task.due_date ? new Date(task.due_date) : undefined);
  }, [task.id]);

  const loadComments = async () => {
    const { data, error } = await supabase
      .from("comments")
      .select("*")
      .eq("task_id", task.id)
      .order("created_at", { ascending: true });
    if (error) return;
    const list = (data ?? []) as Comment[];
    setComments(list);
    const ids = Array.from(new Set(list.map((c) => c.user_id)));
    if (ids.length) {
      const { data: ps } = await supabase.from("profiles").select("id, display_name, email").in("id", ids);
      const map: Record<string, Profile> = {};
      (ps ?? []).forEach((p) => { map[p.id] = p as Profile; });
      setProfiles(map);
    }
  };

  useEffect(() => {
    loadComments();
    const ch = supabase
      .channel(`comments-${task.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `task_id=eq.${task.id}` },
        () => loadComments()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [task.id]);

  const save = async (patch: Partial<Task>) => {
    const { data, error } = await supabase
      .from("tasks")
      .update(patch)
      .eq("id", task.id)
      .select()
      .single();
    if (error) return toast.error(error.message);
    if (data) onChange(data as Task);
  };

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim()) return;
    const { error } = await supabase.from("comments").insert({
      task_id: task.id, user_id: user.id, content: newComment.trim(),
    });
    if (error) return toast.error(error.message);
    setNewComment("");
  };

  const deleteTask = async () => {
    if (!confirm("Excluir esta tarefa?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) return toast.error(error.message);
    onDeleted();
  };

  const deleteComment = async (id: string) => {
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Detalhes da tarefa</DialogTitle>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== task.title && save({ title })}
            className="text-xl font-semibold border-none shadow-none px-0 focus-visible:ring-0"
          />
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs uppercase text-muted-foreground">Coluna</Label>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {COLUMNS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => { setStatus(c.key); save({ status: c.key }); }}
                  className={cn(
                    "text-xs px-3 py-1 rounded-full border transition",
                    status === c.key ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground hover:bg-accent"
                  )}
                >{c.label}</button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase text-muted-foreground">Prazo</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal mt-1">
                  <CalIcon className="h-4 w-4 mr-2" />
                  {due ? format(due, "PPP", { locale: ptBR }) : "Definir prazo"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={due}
                  onSelect={(d) => { setDue(d); save({ due_date: d ? d.toISOString() : null }); }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
                {due && (
                  <div className="p-2 border-t">
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => { setDue(undefined); save({ due_date: null }); }}>
                      Remover prazo
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div>
          <Label className="text-xs uppercase text-muted-foreground">Descrição</Label>
          <Textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => desc !== (task.description ?? "") && save({ description: desc })}
            rows={4}
            placeholder="Adicione mais detalhes…"
            className="mt-1"
          />
        </div>

        <div>
          <Label className="text-xs uppercase text-muted-foreground mb-2 block">
            Comentários ({comments.length})
          </Label>
          <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
            {comments.length === 0 && <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>}
            {comments.map((c) => {
              const p = profiles[c.user_id];
              const name = p?.display_name || p?.email || "Usuário";
              const mine = c.user_id === user?.id;
              return (
                <div key={c.id} className="flex gap-3 group">
                  <div className="h-8 w-8 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
                    {name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium">{name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {format(new Date(c.created_at), "dd MMM HH:mm", { locale: ptBR })}
                      </span>
                      {mine && (
                        <button onClick={() => deleteComment(c.id)} className="ml-auto opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm mt-0.5 whitespace-pre-wrap break-words">{c.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <form onSubmit={addComment} className="flex gap-2 mt-3">
            <Input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Escreva um comentário…"
            />
            <Button type="submit" size="icon" disabled={!newComment.trim()}><Send className="h-4 w-4" /></Button>
          </form>
        </div>

        <div className="flex justify-between pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={deleteTask} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4 mr-1" /> Excluir tarefa
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
