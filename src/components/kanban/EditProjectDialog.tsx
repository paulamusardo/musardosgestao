import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Project } from "./types";

const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#ec4899", "#64748b"];

export function EditProjectDialog({
  project,
  open,
  onClose,
}: {
  project: Project;
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [client, setClient] = useState(project.client ?? "");
  const [color, setColor] = useState(project.color);

  useEffect(() => {
    setName(project.name);
    setClient(project.client ?? "");
    setColor(project.color);
  }, [project.id]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("projects")
      .update({ name: name.trim(), client: client.trim() || null, color })
      .eq("id", project.id);
    if (error) return toast.error(error.message);
    toast.success("Projeto atualizado");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar projeto</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div>
            <Label htmlFor="en">Nome</Label>
            <Input id="en" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="ec">Cliente</Label>
            <Input id="ec" value={client} onChange={(e) => setClient(e.target.value)} />
          </div>
          <div>
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2 pt-1">
              {PALETTE.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setColor(p)}
                  className={`h-7 w-7 rounded-full border-2 transition ${color === p ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ background: p }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
