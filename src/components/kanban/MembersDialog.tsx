import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Trash2, UserPlus } from "lucide-react";
import type { Profile } from "./types";

type Member = { id: string; user_id: string; role: "owner" | "member" };

export function MembersDialog({
  projectId,
  isOwner,
  open,
  onClose,
}: {
  projectId: string;
  isOwner: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("project_members")
      .select("id, user_id, role")
      .eq("project_id", projectId);
    const list = (data ?? []) as Member[];
    setMembers(list);
    if (list.length) {
      const { data: ps } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", list.map((m) => m.user_id));
      const map: Record<string, Profile> = {};
      (ps ?? []).forEach((p) => { map[p.id] = p as Profile; });
      setProfiles(map);
    }
  };

  useEffect(() => {
    if (!open) return;
    load();
    const ch = supabase
      .channel(`members-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_members", filter: `project_id=eq.${projectId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    const { data: p, error: pe } = await supabase
      .from("profiles")
      .select("id, email")
      .ilike("email", email.trim())
      .maybeSingle();
    if (pe) { setBusy(false); return toast.error(pe.message); }
    if (!p) {
      setBusy(false);
      return toast.error("Usuário não encontrado. Peça para a pessoa se cadastrar primeiro.");
    }
    const { error } = await supabase.from("project_members").insert({
      project_id: projectId,
      user_id: p.id,
      role: "member",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setEmail("");
    toast.success("Membro adicionado");
  };

  const remove = async (m: Member) => {
    if (m.role === "owner") return toast.error("O dono não pode ser removido");
    const { error } = await supabase.from("project_members").delete().eq("id", m.id);
    if (error) return toast.error(error.message);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Membros do projeto</DialogTitle></DialogHeader>
        {isOwner && (
          <form onSubmit={invite} className="flex gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
              required
            />
            <Button type="submit" disabled={busy}><UserPlus className="h-4 w-4 mr-1" /> Convidar</Button>
          </form>
        )}
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {members.map((m) => {
            const p = profiles[m.user_id];
            const name = p?.display_name || p?.email || "Usuário";
            return (
              <div key={m.id} className="flex items-center gap-3 p-2 rounded-md border">
                <div className="h-8 w-8 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center">
                  {name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{name}</div>
                  <div className="text-xs text-muted-foreground truncate">{p?.email}</div>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.role}</span>
                {isOwner && m.role !== "owner" && m.user_id !== user?.id && (
                  <button onClick={() => remove(m)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
