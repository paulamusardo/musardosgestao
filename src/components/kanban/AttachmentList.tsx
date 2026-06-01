import { useEffect, useState } from "react";
import { Paperclip, Trash2, FileText, Download, Loader2, Upload, Pin, PinOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { TaskAttachment } from "./types";

export function AttachmentList({
  taskId,
  projectId,
  commentId,
  compact,
}: {
  taskId: string;
  projectId: string;
  commentId?: string | null;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const [items, setItems] = useState<TaskAttachment[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    let q = supabase.from("task_attachments").select("*").eq("task_id", taskId).order("created_at", { ascending: true });
    if (commentId !== undefined) {
      q = commentId === null ? q.is("comment_id", null) : q.eq("comment_id", commentId);
    }
    const { data, error } = await q;
    if (error) return;
    const list = (data ?? []) as TaskAttachment[];
    setItems(list);
    if (list.length) {
      const { data: signed } = await supabase.storage
        .from("task-attachments")
        .createSignedUrls(list.map((a) => a.path), 3600);
      const map: Record<string, string> = {};
      (signed ?? []).forEach((s, i) => { if (s.signedUrl) map[list[i].id] = s.signedUrl; });
      setUrls(map);
    } else {
      setUrls({});
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [taskId, commentId]);

  useEffect(() => {
    const ch = supabase
      .channel(`att-${taskId}-${commentId ?? "null"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_attachments", filter: `task_id=eq.${taskId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [taskId]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || !user || !files.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`${file.name}: máximo 50MB`);
        continue;
      }
      const ext = file.name.split(".").pop() ?? "bin";
      const safe = file.name.replace(/[^\w.\- ]/g, "_");
      const path = `${projectId}/${taskId}/${crypto.randomUUID()}-${safe}`;
      const { error: upErr } = await supabase.storage.from("task-attachments").upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (upErr) { toast.error(upErr.message); continue; }
      const { error: dbErr } = await supabase.from("task_attachments").insert({
        task_id: taskId,
        comment_id: commentId ?? null,
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
      void ext;
    }
    setUploading(false);
  };

  const remove = async (a: TaskAttachment) => {
    if (!confirm(`Remover "${a.name}"?`)) return;
    await supabase.storage.from("task-attachments").remove([a.path]);
    const { error } = await supabase.from("task_attachments").delete().eq("id", a.id);
    if (error) toast.error(error.message);
  };

  const togglePin = async (a: TaskAttachment) => {
    if (a.pinned) {
      const { error } = await supabase.from("task_attachments").update({ pinned: false }).eq("id", a.id);
      if (error) toast.error(error.message);
      return;
    }
    // unpin any previously pinned attachment for this task, then pin this one
    const { error: e1 } = await supabase.from("task_attachments").update({ pinned: false }).eq("task_id", taskId).eq("pinned", true);
    if (e1) return toast.error(e1.message);
    const { error: e2 } = await supabase.from("task_attachments").update({ pinned: true }).eq("id", a.id);
    if (e2) toast.error(e2.message);
    else toast.success("Anexo fixado no card");
  };

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      {items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {items.map((a) => {
            const url = urls[a.id];
            const isImg = a.mime?.startsWith("image/");
            const isVid = a.mime?.startsWith("video/");
            return (
              <div key={a.id} className={`group relative rounded-md border bg-muted/30 overflow-hidden ${a.pinned ? "ring-2 ring-primary/60" : ""}`}>
                {isImg && url ? (
                  <a href={url} target="_blank" rel="noreferrer" className="block">
                    <img src={url} alt={a.name} className="w-full h-32 object-cover" />
                  </a>
                ) : isVid && url ? (
                  <video src={url} controls className="w-full h-32 bg-black object-contain" />
                ) : (
                  <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-3 text-sm hover:bg-accent">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{a.name}</span>
                    <Download className="h-3.5 w-3.5 text-muted-foreground" />
                  </a>
                )}
                {(isImg || isVid) && (
                  <div className="px-2 py-1 text-[11px] text-muted-foreground truncate flex items-center gap-1 border-t bg-card">
                    <span className="truncate flex-1">{a.name}</span>
                    {url && <a href={url} target="_blank" rel="noreferrer" className="hover:text-foreground"><Download className="h-3 w-3" /></a>}
                  </div>
                )}
                <div className="absolute top-1 right-1 flex gap-1">
                  <button
                    onClick={() => togglePin(a)}
                    className={`p-1 rounded bg-card/90 border transition ${a.pinned ? "text-primary opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"}`}
                    aria-label={a.pinned ? "Desafixar" : "Fixar no card"}
                    title={a.pinned ? "Desafixar do card" : "Fixar no card"}
                  >
                    {a.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                  </button>
                  {a.uploader_id === user?.id && (
                    <button
                      onClick={() => remove(a)}
                      className="p-1 rounded bg-card/90 border opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
                      aria-label="Remover"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <label className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : compact ? <Paperclip className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
        <span>{uploading ? "Enviando…" : compact ? "Anexar arquivo" : "Anexar foto, vídeo ou documento"}</span>
        <input
          type="file"
          multiple
          className="hidden"
          accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
          onChange={(e) => { handleUpload(e.target.files); e.currentTarget.value = ""; }}
        />
      </label>
    </div>
  );
}

export function AttachmentCount({ taskId }: { taskId: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const load = async () => {
      const { count } = await supabase.from("task_attachments").select("id", { count: "exact", head: true }).eq("task_id", taskId);
      setN(count ?? 0);
    };
    load();
    const ch = supabase.channel(`attc-${taskId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_attachments", filter: `task_id=eq.${taskId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [taskId]);
  if (n === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
      <Paperclip className="h-3 w-3" /> {n}
    </span>
  );
}

export function PinnedAttachmentPreview({ taskId }: { taskId: string }) {
  const [att, setAtt] = useState<TaskAttachment | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("task_attachments")
        .select("*")
        .eq("task_id", taskId)
        .eq("pinned", true)
        .maybeSingle();
      if (!active) return;
      const a = (data as TaskAttachment) ?? null;
      setAtt(a);
      if (a) {
        const { data: signed } = await supabase.storage.from("task-attachments").createSignedUrl(a.path, 3600);
        if (active) setUrl(signed?.signedUrl ?? null);
      } else {
        setUrl(null);
      }
    };
    load();
    const ch = supabase.channel(`att-pin-${taskId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_attachments", filter: `task_id=eq.${taskId}` }, load)
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [taskId]);

  if (!att) return null;
  const isImg = att.mime?.startsWith("image/");
  const isVid = att.mime?.startsWith("video/");

  return (
    <div className="mb-2 -mx-3 -mt-3 border-b bg-muted/40">
      {isImg && url ? (
        <img src={url} alt={att.name} className="w-full h-28 object-cover" />
      ) : isVid && url ? (
        <video src={url} muted className="w-full h-28 bg-black object-contain pointer-events-none" />
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
          <FileText className="h-4 w-4 shrink-0" />
          <span className="truncate">{att.name}</span>
        </div>
      )}
    </div>
  );
}
