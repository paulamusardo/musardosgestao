import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({ component: ProfilePage });

function ProfilePage() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setDisplayName(data.display_name ?? "");
          setAvatarUrl(data.avatar_url ?? null);
        }
      });
  }, [user?.id]);

  const saveProfile = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", user.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado");
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "png";
    const path = `${user.id}/avatar.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = `${pub.publicUrl}?v=${Date.now()}`;
    await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
    setAvatarUrl(url);
    setUploading(false);
    toast.success("Foto atualizada");
  };

  const changePassword = async () => {
    if (password.length < 6) return toast.error("Senha precisa ter ao menos 6 caracteres");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    setPassword("");
    toast.success("Senha alterada");
  };

  const name = displayName || user?.email?.split("@")[0] || "Usuário";

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight">Perfil</h1>
      <p className="text-sm text-muted-foreground mb-6">Atualize seus dados de acesso.</p>

      <div className="rounded-xl border bg-card p-6 space-y-6">
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover border" />
          ) : (
            <div className="h-20 w-20 rounded-full bg-primary/15 text-primary text-xl font-semibold flex items-center justify-center border">
              {name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer text-primary hover:underline">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Enviando…" : "Trocar foto"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
          </label>
        </div>

        <div>
          <Label htmlFor="dn">Nome de exibição</Label>
          <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div>
          <Label>E-mail</Label>
          <Input value={user?.email ?? ""} disabled />
        </div>
        <Button onClick={saveProfile} disabled={busy}>Salvar perfil</Button>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-3 mt-6">
        <h2 className="font-semibold">Alterar senha</h2>
        <div>
          <Label htmlFor="pw">Nova senha</Label>
          <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} />
        </div>
        <Button variant="outline" onClick={changePassword} disabled={busy || !password}>Alterar senha</Button>
      </div>
    </div>
  );
}
