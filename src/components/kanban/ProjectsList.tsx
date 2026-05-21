import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { KanbanSquare, LogOut, Plus, Trash2, Users, Pencil } from "lucide-react";
import type { Project } from "./types";
import { EditProjectDialog } from "./EditProjectDialog";

const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#ec4899", "#64748b"];

export function ProjectsList() {
  const { user, signOut } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [color, setColor] = useState(PALETTE[0]);

  const load = async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    const list = (data ?? []) as Project[];
    setProjects(list);

    if (list.length) {
      const { data: tasks } = await supabase
        .from("tasks")
        .select("project_id")
        .in("project_id", list.map((p) => p.id));
      const map: Record<string, number> = {};
      (tasks ?? []).forEach((t: { project_id: string | null }) => {
        if (t.project_id) map[t.project_id] = (map[t.project_id] ?? 0) + 1;
      });
      setCounts(map);
    } else {
      setCounts({});
    }
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("projects-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "project_members" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim()) return;
    const { error } = await supabase.from("projects").insert({
      name: name.trim(),
      client: client.trim() || null,
      color,
      created_by: user.id,
    });
    if (error) return toast.error(error.message);
    setName(""); setClient(""); setColor(PALETTE[0]); setOpen(false);
    toast.success("Projeto criado");
  };

  const remove = async (p: Project) => {
    if (!confirm(`Excluir o projeto "${p.name}"? Todas as tarefas serão removidas.`)) return;
    const { error } = await supabase.from("projects").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Projeto excluído");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <KanbanSquare className="h-5 w-5 text-primary" />
            <span>Flowboard</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground hidden sm:block">{user?.email}</div>
            <Button size="sm" variant="ghost" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Projetos</h1>
            <p className="text-muted-foreground mt-1 text-sm">Um Kanban dedicado para cada cliente.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> Novo projeto</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo projeto</DialogTitle></DialogHeader>
              <form onSubmit={create} className="space-y-3">
                <div>
                  <Label htmlFor="n">Nome do projeto</Label>
                  <Input id="n" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Website institucional" required />
                </div>
                <div>
                  <Label htmlFor="c">Cliente</Label>
                  <Input id="c" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Ex.: Acme Ltda." />
                </div>
                <div>
                  <Label>Cor</Label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {PALETTE.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setColor(p)}
                        aria-label={p}
                        className={`h-7 w-7 rounded-full border-2 transition ${color === p ? "border-foreground scale-110" : "border-transparent"}`}
                        style={{ background: p }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button type="submit">Criar projeto</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {projects.length === 0 ? (
          <div className="border border-dashed rounded-xl py-20 text-center">
            <KanbanSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-medium">Nenhum projeto ainda</h3>
            <p className="text-sm text-muted-foreground mt-1">Crie o primeiro projeto para começar.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <div key={p.id} className="group relative rounded-xl border bg-card hover:border-primary/40 hover:shadow-md transition">
                <Link to="/projects/$projectId" params={{ projectId: p.id }} className="block p-5">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                    <h3 className="font-semibold truncate">{p.name}</h3>
                  </div>
                  {p.client && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      <span className="truncate">{p.client}</span>
                    </div>
                  )}
                  <div className="mt-4 text-xs text-muted-foreground">
                    {counts[p.id] ?? 0} {(counts[p.id] ?? 0) === 1 ? "tarefa" : "tarefas"}
                  </div>
                </Link>
                {p.created_by === user?.id && (
                  <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => setEditing(p)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(p)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {editing && (
        <EditProjectDialog project={editing} open onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
