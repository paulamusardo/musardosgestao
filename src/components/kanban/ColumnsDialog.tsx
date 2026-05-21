import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, ArrowUp, ArrowDown, Plus, Timer } from "lucide-react";
import type { ProjectColumn } from "./types";

const COLOR_PALETTE = ["#94a3b8", "#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#a855f7", "#06b6d4", "#ec4899"];

export function ColumnsDialog({
  projectId,
  columns,
  isOwner,
  open,
  onClose,
}: {
  projectId: string;
  columns: ProjectColumn[];
  isOwner: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<ProjectColumn[]>(columns);
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => { setLocal(columns); }, [columns]);

  const update = async (id: string, patch: Partial<ProjectColumn>) => {
    setLocal((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const { error } = await supabase.from("project_columns").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  };

  const setInProgress = async (id: string) => {
    // unset others first
    const { error: e1 } = await supabase
      .from("project_columns")
      .update({ is_in_progress: false })
      .eq("project_id", projectId)
      .neq("id", id);
    if (e1) return toast.error(e1.message);
    await update(id, { is_in_progress: true });
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= local.length) return;
    const a = local[idx], b = local[target];
    const pa = a.position, pb = b.position;
    await update(a.id, { position: pb });
    await update(b.id, { position: pa });
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim()) return;
    const pos = (local.at(-1)?.position ?? 0) + 1;
    const { error } = await supabase.from("project_columns").insert({
      project_id: projectId,
      label: newLabel.trim(),
      position: pos,
      color: COLOR_PALETTE[local.length % COLOR_PALETTE.length],
    });
    if (error) return toast.error(error.message);
    setNewLabel("");
  };

  const remove = async (c: ProjectColumn) => {
    if (!confirm(`Excluir coluna "${c.label}"? Tarefas ficarão sem coluna.`)) return;
    const { error } = await supabase.from("project_columns").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Configurar colunas</DialogTitle></DialogHeader>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {local.sort((a, b) => a.position - b.position).map((c, idx) => (
            <div key={c.id} className="flex items-center gap-2 p-2 rounded-md border">
              <div className="flex flex-col">
                <button disabled={!isOwner || idx === 0} onClick={() => move(idx, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                <button disabled={!isOwner || idx === local.length - 1} onClick={() => move(idx, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
              </div>
              <Input
                value={c.label}
                disabled={!isOwner}
                onChange={(e) => setLocal((p) => p.map((x) => x.id === c.id ? { ...x, label: e.target.value } : x))}
                onBlur={(e) => e.target.value !== columns.find((x) => x.id === c.id)?.label && update(c.id, { label: e.target.value })}
                className="flex-1"
              />
              <div className="flex gap-1">
                {COLOR_PALETTE.map((col) => (
                  <button
                    key={col}
                    disabled={!isOwner}
                    onClick={() => update(c.id, { color: col })}
                    className={`h-5 w-5 rounded-full border-2 ${c.color === col ? "border-foreground" : "border-transparent"}`}
                    style={{ background: col }}
                  />
                ))}
              </div>
              <button
                disabled={!isOwner}
                onClick={() => setInProgress(c.id)}
                title="Marcar como coluna 'Em Andamento' (ativa o cronômetro)"
                className={`p-1.5 rounded ${c.is_in_progress ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
              >
                <Timer className="h-3.5 w-3.5" />
              </button>
              {isOwner && (
                <button onClick={() => remove(c)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {isOwner && (
          <form onSubmit={add} className="flex gap-2 pt-2 border-t">
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nova coluna" />
            <Button type="submit"><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
          </form>
        )}
        <p className="text-xs text-muted-foreground">
          O ícone <Timer className="inline h-3 w-3" /> marca a coluna que ativa o cronômetro das tarefas.
        </p>
      </DialogContent>
    </Dialog>
  );
}
