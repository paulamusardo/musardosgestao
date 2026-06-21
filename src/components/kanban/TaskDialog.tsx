import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalIcon, Trash2, Send, Timer, UserCheck, FolderKanban } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import type { Task, Comment, ProjectColumn, Profile, TaskTimeEntry, Project } from "./types";
import { formatDurationLong } from "./types";
import { AttachmentList } from "./AttachmentList";
import { ActivityList } from "./ActivityList";
import { RichTextEditor } from "./RichTextEditor";
import { Paperclip, X } from "lucide-react";

export function TaskDialog({
  task,
  columns,
  members,
  assignees,
  openEntry,
  onClose,
  onChange,
  onDeleted,
}: {
  task: Task;
  columns: ProjectColumn[];
  members: Profile[];
  assignees: Profile[];
  openEntry: TaskTimeEntry | null;
  onClose: () => void;
  onChange: (t: Task) => void;
  onDeleted: () => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description ?? "");
  const [columnId, setColumnId] = useState<string | null>(task.column_id);
  const [due, setDue] = useState<Date | undefined>(task.due_date ? new Date(task.due_date) : undefined);
  const [comments, setComments] = useState<Comment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [newComment, setNewComment] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [tick, setTick] = useState(0);
  const [myProjects, setMyProjects] = useState<Project[]>([]);

  useEffect(() => {
    setTitle(task.title);
    setDesc(task.description ?? "");
    setColumnId(task.column_id);
    setDue(task.due_date ? new Date(task.due_date) : undefined);
  }, [task.id]);

  useEffect(() => {
    if (!openEntry) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [openEntry?.id]);

  const liveSeconds = openEntry
    ? task.total_seconds + Math.floor((Date.now() - new Date(openEntry.started_at).getTime()) / 1000)
    : task.total_seconds;

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

  const save = async (patch: Partial<{ title: string; description: string | null; column_id: string | null; due_date: string | null }>) => {
    const { data, error } = await supabase
      .from("tasks")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("id", task.id)
      .select()
      .single();
    if (error) return toast.error(error.message);
    if (data) onChange(data as unknown as Task);
  };

  const toggleAssignee = async (userId: string) => {
    const has = assignees.some((a) => a.id === userId);
    if (has) {
      const { error } = await supabase.from("task_assignees").delete().eq("task_id", task.id).eq("user_id", userId);
      if (error) toast.error(error.message);
    } else {
      const { error } = await supabase.from("task_assignees").insert({ task_id: task.id, user_id: userId });
      if (error) toast.error(error.message);
    }
  };

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const text = newComment.trim();
    if (!text && pendingFiles.length === 0) return;
    setPosting(true);
    try {
      let commentId: string | null = null;
      if (text) {
        const { data, error } = await supabase
          .from("comments")
          .insert({ task_id: task.id, user_id: user.id, content: text })
          .select()
          .single();
        if (error) { toast.error(error.message); return; }
        commentId = (data as { id: string }).id;
      }

      if (pendingFiles.length && task.project_id) {
        for (const file of pendingFiles) {
          if (file.size > 50 * 1024 * 1024) {
            toast.error(`${file.name}: máximo 50MB`);
            continue;
          }
          const safe = file.name.replace(/[^\w.\- ]/g, "_");
          const path = `${task.project_id}/${task.id}/${crypto.randomUUID()}-${safe}`;
          const { error: upErr } = await supabase.storage
            .from("task-attachments")
            .upload(path, file, { contentType: file.type || undefined, upsert: false });
          if (upErr) { toast.error(upErr.message); continue; }
          const { error: dbErr } = await supabase.from("task_attachments").insert({
            task_id: task.id,
            comment_id: commentId,
            uploader_id: user.id,
            path,
            name: file.name,
            mime: file.type || null,
            size: file.size,
          });
          if (dbErr) {
            toast.error(dbErr.message);
            await supabase.storage.from("task-attachments").remove([path]);
          }
        }
      }
      setNewComment("");
      setPendingFiles([]);
    } finally {
      setPosting(false);
    }
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
              {columns.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setColumnId(c.id); save({ column_id: c.id }); }}
                  className={cn(
                    "text-xs px-3 py-1 rounded-full border transition",
                    columnId === c.id ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground hover:bg-accent"
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

        <div className="rounded-lg border p-3 flex items-center gap-3">
          <Timer className={`h-5 w-5 ${openEntry ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
          <div className="flex-1">
            <div className="text-xs uppercase text-muted-foreground">Tempo total</div>
            <div className="font-mono text-lg tabular-nums">{formatDurationLong(liveSeconds)}{tick < 0 ? "" : ""}</div>
          </div>
          {openEntry && <span className="text-xs text-primary font-medium">em execução</span>}
        </div>

        <div>
          <Label className="text-xs uppercase text-muted-foreground mb-2 block">Responsáveis</Label>
          <div className="flex flex-wrap gap-2">
            {members.length === 0 && <p className="text-sm text-muted-foreground">Adicione membros ao projeto para atribuir tarefas.</p>}
            {members.map((m) => {
              const has = assignees.some((a) => a.id === m.id);
              const name = m.display_name || m.email || "?";
              return (
                <button
                  key={m.id}
                  onClick={() => toggleAssignee(m.id)}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs transition",
                    has ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground hover:bg-accent"
                  )}
                >
                  {has && <UserCheck className="h-3 w-3" />}
                  {name}
                </button>
              );
            })}
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
          {task.project_id && (
            <div className="mt-3">
              <AttachmentList taskId={task.id} projectId={task.project_id} commentId={null} />
            </div>
          )}
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
                    {task.project_id && (
                      <div className="mt-2">
                        <AttachmentList taskId={task.id} projectId={task.project_id} commentId={c.id} compact />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <form onSubmit={addComment} className="mt-3 space-y-2">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Escreva um comentário…"
              rows={2}
              className="resize-none"
            />
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="inline-flex items-center gap-1.5 text-[11px] bg-muted text-muted-foreground rounded-full pl-2 pr-1 py-0.5">
                    <Paperclip className="h-3 w-3" />
                    <span className="max-w-[10rem] truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setPendingFiles((p) => p.filter((_, idx) => idx !== i))}
                      className="hover:text-foreground"
                      aria-label="Remover anexo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                <Paperclip className="h-3.5 w-3.5" />
                Anexar
                <input
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                  onChange={(e) => {
                    const files = e.target.files ? Array.from(e.target.files) : [];
                    setPendingFiles((p) => [...p, ...files]);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <Button
                type="submit"
                size="sm"
                className="ml-auto"
                disabled={posting || (!newComment.trim() && pendingFiles.length === 0)}
              >
                <Send className="h-4 w-4 mr-1" /> {posting ? "Enviando…" : "Comentar"}
              </Button>
            </div>
          </form>
        </div>

        <div>
          <Label className="text-xs uppercase text-muted-foreground mb-2 block">Histórico</Label>
          <ActivityList taskId={task.id} />
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
