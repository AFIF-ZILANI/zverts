import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/zerod/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const Profile = () => {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [certName, setCertName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("name,certificate_name,avatar_url").eq("id", user.id).maybeSingle().then(({ data }) => {
      setName(data?.name ?? ""); setCertName(data?.certificate_name ?? ""); setAvatar(data?.avatar_url ?? null);
    });
  }, [user]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const save = async () => {
    setBusy(true);
    await supabase.from("profiles").update({ name, certificate_name: certName }).eq("id", user.id);
    setBusy(false); toast.success(t("profile.saved"));
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const path = `${user.id}/avatar-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
    setAvatar(data.publicUrl); toast.success("Photo updated");
  };

  return (
    <AppShell>
      <section className="container py-12 max-w-2xl">
        <h1 className="font-display text-4xl font-semibold tracking-tight mb-8">{t("profile.title")}</h1>
        <div className="rounded-2xl border border-border bg-gradient-card p-8 shadow-card space-y-6">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-muted overflow-hidden border border-border">
              {avatar && <img src={avatar} alt="" className="w-full h-full object-cover" />}
            </div>
            <label className="cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={upload} />
              <span className="inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 text-sm font-medium">{t("profile.upload")}</span>
            </label>
          </div>
          <div><Label>{t("profile.email")}</Label><Input value={user.email ?? ""} disabled className="mt-1.5" /></div>
          <div><Label>{t("profile.name")}</Label><Input value={name} onChange={e => setName(e.target.value)} className="mt-1.5" /></div>
          <div><Label>{t("profile.certificateName")}</Label><Input value={certName} onChange={e => setCertName(e.target.value)} className="mt-1.5" /></div>
          <Button onClick={save} disabled={busy} className="bg-gradient-lime text-primary-foreground hover:opacity-90 shadow-glow">{t("common.save")}</Button>
        </div>
      </section>
    </AppShell>
  );
};
export default Profile;