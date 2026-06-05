import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  Trash2,
  LogOut,
  Lock,
  Globe,
  BookOpen,
  Bell,
  User as UserIcon,
  Trophy,
  Pencil,
  ChevronRight,
} from "lucide-react";
import { SmartNotificationSettings } from "@/components/app/SmartNotificationSettings";
import { cn } from "@/lib/utils";

type Profile = {
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  certificate_name: string | null;
  preferred_language: string;
  daily_goal_minutes: number;
  study_reminders_enabled: boolean;
  notify_email: boolean;
  notify_inactivity: boolean;
  notify_completion: boolean;
  profile_public: boolean;
  total_gems: number;
  total_xp: number;
  current_streak: number;
  longest_streak: number;
};

type SectionId = "profile" | "security" | "prefs" | "notifications" | "progress" | "privacy";

const NAV_ITEMS: { id: SectionId; label: string; icon: React.ElementType; description: string }[] = [
  { id: "profile", label: "Profile", icon: UserIcon, description: "Name, photo & certificate" },
  { id: "security", label: "Security", icon: Lock, description: "Sessions & sign-in" },
  { id: "prefs", label: "Learning", icon: BookOpen, description: "Goals & reminders" },
  { id: "notifications", label: "Notifications", icon: Bell, description: "Email & alerts" },
  { id: "progress", label: "Progress", icon: Trophy, description: "XP, streaks & gems" },
  { id: "privacy", label: "Privacy", icon: Globe, description: "Profile visibility" },
];

const Settings = () => {
  const { user, loading, signOut } = useAuth();
  const { t, i18n } = useTranslation();
  const [p, setP] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<SectionId>("profile");

  const [emailInput, setEmailInput] = useState("");
  const [completedCount, setCompletedCount] = useState(0);
  const [courses, setCourses] = useState<{ id: string; title: string; is_public: boolean }[]>([]);

  useEffect(() => {
    if (!user) return;
    setEmailInput(user.email ?? "");
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (data) setP(data as Profile);
      const { count } = await supabase
        .from("module_progress")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("completed", true);
      setCompletedCount(count ?? 0);
      const { data: cs } = await supabase
        .from("courses")
        .select("id,title,is_public")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setCourses(cs ?? []);
    })();
  }, [user]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!p)
    return (
      <AppShell>
        <div className="container py-20 text-muted-foreground font-mono text-sm">Loading…</div>
      </AppShell>
    );

  const update = (patch: Partial<Profile>) => setP({ ...p, ...patch });

  const saveProfile = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        name: p.name,
        certificate_name: p.certificate_name,
        preferred_language: p.preferred_language,
        daily_goal_minutes: p.daily_goal_minutes,
        study_reminders_enabled: p.study_reminders_enabled,
        notify_email: p.notify_email,
        notify_inactivity: p.notify_inactivity,
        notify_completion: p.notify_completion,
        profile_public: p.profile_public,
      })
      .eq("id", user.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success(t("profile.saved"));
    if (p.preferred_language !== i18n.language) i18n.changeLanguage(p.preferred_language);
  };

  const uploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const path = `${user.id}/avatar-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
    update({ avatar_url: data.publicUrl });
    toast.success("Photo updated");
  };

  const changeEmail = async () => {
    if (!emailInput || emailInput === user.email) return;
    const { error } = await supabase.auth.updateUser({ email: emailInput });
    if (error) toast.error(error.message);
    else toast.success("Verification email sent to your new address.");
  };

  const signOutAll = async () => {
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) toast.error(error.message);
    else {
      toast.success("Signed out from all devices");
      window.location.href = "/";
    }
  };

  const toggleCoursePublic = async (id: string, val: boolean) => {
    await supabase.from("courses").update({ is_public: val }).eq("id", id);
    setCourses(courses.map((c) => (c.id === id ? { ...c, is_public: val } : c)));
  };
  const renameCourse = async (id: string, title: string) => {
    if (!title.trim()) return;
    await supabase.from("courses").update({ title }).eq("id", id);
    setCourses(courses.map((c) => (c.id === id ? { ...c, title } : c)));
    toast.success("Course renamed");
  };
  const deleteCourse = async (id: string) => {
    await supabase.from("courses").delete().eq("id", id);
    setCourses(courses.filter((c) => c.id !== id));
    toast.success("Course deleted");
  };

  const resetProgress = async () => {
    const { error } = await supabase.rpc("reset_my_progress");
    if (error) toast.error(error.message);
    else {
      toast.success("All progress reset");
      window.location.reload();
    }
  };

  const deleteAccount = async () => {
    const { error } = await supabase.functions.invoke("delete-account");
    if (error) return toast.error(error.message);
    await signOut();
    window.location.href = "/";
  };

  const level = Math.floor(p.total_xp / 500) + 1;
  const activeNav = NAV_ITEMS.find((n) => n.id === active)!;

  return (
    <AppShell>
      <section className="container py-10 md:py-14 max-w-5xl">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-2">
            Manage your profile, security, learning preferences, and privacy.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-6 items-start">
          {/* ── Sidebar ── */}
          <nav className="w-full md:w-60 shrink-0 rounded-2xl border border-border bg-gradient-card shadow-card overflow-hidden">
            {/* User mini card */}
            <div className="flex items-center gap-3 p-4 border-b border-border">
              <div className="h-9 w-9 rounded-full bg-muted overflow-hidden border border-border shrink-0">
                {p.avatar_url && <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{p.name ?? "—"}</div>
                <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
              </div>
            </div>

            {/* Nav items */}
            <ul className="p-2 space-y-0.5">
              {NAV_ITEMS.map(({ id, label, icon: Icon, description }) => {
                const isActive = active === id;
                return (
                  <li key={id}>
                    <button
                      onClick={() => setActive(id)}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors group",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className={cn("text-sm font-medium leading-tight", isActive && "text-primary")}>
                          {label}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">{description}</div>
                      </div>
                      {isActive && <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* ── Content panel ── */}
          <div className="flex-1 min-w-0">
            {/* Panel header */}
            <div className="flex items-center gap-2.5 mb-5">
              <activeNav.icon className="h-5 w-5 text-primary" />
              <h2 className="font-display text-xl font-semibold">{activeNav.label}</h2>
            </div>

            {/* PROFILE */}
            {active === "profile" && (
              <div className="rounded-2xl border border-border bg-gradient-card p-8 shadow-card space-y-6">
                <div className="flex items-center gap-5">
                  <div className="h-20 w-20 rounded-full bg-muted overflow-hidden border border-border">
                    {p.avatar_url && <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={uploadPhoto} />
                    <span className="inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent h-9 px-4 text-sm font-medium">
                      {t("profile.upload")}
                    </span>
                  </label>
                </div>
                <div>
                  <Label>{t("profile.name")}</Label>
                  <Input className="mt-1.5" value={p.name ?? ""} onChange={(e) => update({ name: e.target.value })} />
                </div>
                <div>
                  <Label>{t("profile.certificateName")}</Label>
                  <Input
                    className="mt-1.5"
                    value={p.certificate_name ?? ""}
                    onChange={(e) => update({ certificate_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t("profile.email")}</Label>
                  <div className="flex gap-2 mt-1.5">
                    <Input value={emailInput} onChange={(e) => setEmailInput(e.target.value)} type="email" />
                    <Button variant="outline" onClick={changeEmail} disabled={emailInput === user.email}>
                      Update email
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    A verification link will be sent to the new address.
                  </p>
                </div>
                <Button
                  onClick={saveProfile}
                  disabled={busy}
                  className="bg-gradient-lime text-primary-foreground hover:opacity-90 shadow-glow"
                >
                  {t("common.save")}
                </Button>
              </div>
            )}

            {/* SECURITY */}
            {active === "security" && (
              <div className="rounded-2xl border border-border bg-gradient-card p-8 shadow-card space-y-6">
                <div>
                  <div className="font-medium">Signed in with Google</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your account is managed by Google. To change your password or recovery options, visit your Google
                    account settings.
                  </p>
                </div>
                <div className="border-t border-border pt-6 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="font-medium">Sign out everywhere</div>
                    <p className="text-sm text-muted-foreground">Ends every active session on every device.</p>
                  </div>
                  <Button variant="outline" onClick={signOutAll}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign out all
                  </Button>
                </div>
              </div>
            )}

            {/* LEARNING PREFS */}
            {active === "prefs" && (
              <div className="rounded-2xl border border-border bg-gradient-card p-8 shadow-card space-y-6">
                <div>
                  <Label>{t("profile.language")}</Label>
                  <Select value={p.preferred_language} onValueChange={(v) => update({ preferred_language: v })}>
                    <SelectTrigger className="mt-1.5 w-60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="bn">বাংলা (Bangla)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Daily learning goal (minutes)</Label>
                  <Input
                    type="number"
                    min={5}
                    max={480}
                    className="mt-1.5 w-40"
                    value={p.daily_goal_minutes}
                    onChange={(e) =>
                      update({ daily_goal_minutes: Math.max(5, Math.min(480, parseInt(e.target.value) || 30)) })
                    }
                  />
                </div>
                <div className="flex items-center justify-between border-t border-border pt-6">
                  <div>
                    <div className="font-medium">Study reminders</div>
                    <p className="text-sm text-muted-foreground">Daily nudge to keep your streak alive.</p>
                  </div>
                  <Switch
                    checked={p.study_reminders_enabled}
                    onCheckedChange={(v) => update({ study_reminders_enabled: v })}
                  />
                </div>
                <Button
                  onClick={saveProfile}
                  disabled={busy}
                  className="bg-gradient-lime text-primary-foreground hover:opacity-90 shadow-glow"
                >
                  {t("common.save")}
                </Button>
              </div>
            )}

            {/* NOTIFICATIONS */}
            {active === "notifications" && (
              <>
                <div className="rounded-2xl border border-border bg-gradient-card p-8 shadow-card space-y-5">
                  {[
                    {
                      k: "notify_email" as const,
                      title: "Email notifications",
                      body: "Master switch for all email from ZverTs.",
                    },
                    {
                      k: "notify_inactivity" as const,
                      title: "Inactivity alerts",
                      body: "Get a nudge if you haven't studied in a few days.",
                    },
                    {
                      k: "notify_completion" as const,
                      title: "Completion emails",
                      body: "Receive a recap when you finish a module or course.",
                    },
                  ].map((item) => (
                    <div key={item.k} className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{item.title}</div>
                        <p className="text-sm text-muted-foreground">{item.body}</p>
                      </div>
                      <Switch checked={p[item.k]} onCheckedChange={(v) => update({ [item.k]: v } as any)} />
                    </div>
                  ))}
                  <Button
                    onClick={saveProfile}
                    disabled={busy}
                    className="bg-gradient-lime text-primary-foreground hover:opacity-90 shadow-glow"
                  >
                    {t("common.save")}
                  </Button>
                </div>
                <SmartNotificationSettings />
              </>
            )}

            {/* PROGRESS */}
            {active === "progress" && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { label: "Total gems", value: p.total_gems },
                  { label: "Total XP", value: p.total_xp },
                  { label: "Level", value: level },
                  { label: "Modules completed", value: completedCount },
                  { label: "Current streak", value: `${p.current_streak} days` },
                  { label: "Longest streak", value: `${p.longest_streak} days` },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-border bg-gradient-card p-5 shadow-card">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {s.label}
                    </div>
                    <div className="font-display text-3xl text-primary mt-2">{s.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* PRIVACY */}
            {active === "privacy" && (
              <div className="rounded-2xl border border-border bg-gradient-card p-8 shadow-card space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Public profile</div>
                    <p className="text-sm text-muted-foreground">
                      Show your name and avatar on the leaderboard and shared courses.
                    </p>
                  </div>
                  <Switch checked={p.profile_public} onCheckedChange={(v) => update({ profile_public: v })} />
                </div>
                <p className="text-xs text-muted-foreground border-t border-border pt-5">
                  Per-course public/private visibility lives under{" "}
                  <span className="font-medium text-foreground">My courses</span>.
                </p>
                <div className="border-t border-border pt-5 flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-muted-foreground font-mono uppercase tracking-widest">Legal</span>
                  <Link to="/refund-policy" className="text-primary hover:underline font-medium">
                    Refund Policy →
                  </Link>
                </div>
                <Button
                  onClick={saveProfile}
                  disabled={busy}
                  className="bg-gradient-lime text-primary-foreground hover:opacity-90 shadow-glow"
                >
                  {t("common.save")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
};

const CourseRow = ({
  c,
  onRename,
  onToggle,
  onDelete,
}: {
  c: { id: string; title: string; is_public: boolean };
  onRename: (id: string, t: string) => void;
  onToggle: (id: string, v: boolean) => void;
  onDelete: (id: string) => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(c.title);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card/50 p-3">
      {editing ? (
        <>
          <Input value={val} onChange={(e) => setVal(e.target.value)} className="h-8" />
          <Button
            size="sm"
            className="h-8"
            onClick={() => {
              onRename(c.id, val);
              setEditing(false);
            }}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => {
              setVal(c.title);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </>
      ) : (
        <>
          <Link to={`/courses/${c.id}`} className="flex-1 truncate font-medium hover:text-primary">
            {c.title}
          </Link>
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
            <span>{c.is_public ? "Public" : "Private"}</span>
            <Switch checked={c.is_public} onCheckedChange={(v) => onToggle(c.id, v)} />
          </div>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{c.title}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  The course and all its modules and progress will be permanently removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => onDelete(c.id)}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
};

export default Settings;
