import { useEffect, useState } from "react";
import { Navigate, Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
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
    ShieldAlert,
    RotateCcw,
    Pencil,
    MoonStar,
    ChevronLeft,
    ChevronRight,
    FileText,
    ExternalLink,
} from "lucide-react";
import { SmartNotificationSettings } from "@/components/app/SmartNotificationSettings";
import { PushToggle } from "@/components/app/PushToggle";
import { IslamicModeSettings } from "@/components/app/IslamicModeSettings";
import { SettingsGroup, SettingsNavRow, SettingsRow } from "@/components/app/settings/SettingsUI";
import { useIslamicSettings } from "@/lib/islamic/dailyAyah";
import { cn } from "@/lib/utils";

type Profile = {
    name: string | null;
    email: string | null;
    avatar_url: string | null;
    certificate_name: string | null;
    preferred_language: string;
    // user_preferences
    daily_goal_minutes: number;
    study_reminders_enabled: boolean;
    notify_email: boolean;
    notify_inactivity: boolean;
    notify_completion: boolean;
    profile_public: boolean;
    // user_progress
    total_gems: number;
    total_xp: number;
    current_streak: number;
    longest_streak: number;
};

// The settings list: phones show it on its own and open a section full-screen;
// wider screens keep it beside the open section.
const SECTIONS = [
    {
        id: "account",
        group: "Account",
        title: "Account",
        subtitle: "Name, photo and email",
        icon: UserIcon,
        tint: "bg-sky-500",
    },
    {
        id: "security",
        group: "Account",
        title: "Security",
        subtitle: "Sign-in and sessions",
        icon: Lock,
        tint: "bg-slate-500",
    },
    {
        id: "learning",
        group: "Preferences",
        title: "Learning",
        subtitle: "Language, daily goal, reminders",
        icon: BookOpen,
        tint: "bg-emerald-500",
    },
    {
        id: "islamic",
        group: "Preferences",
        title: "Islamic Mode",
        subtitle: "Daily Ayah on your dashboard",
        icon: MoonStar,
        tint: "bg-teal-600",
    },
    {
        id: "notifications",
        group: "Preferences",
        title: "Notifications",
        subtitle: "Push, email and in-app alerts",
        icon: Bell,
        tint: "bg-rose-500",
    },
    {
        id: "progress",
        group: "You",
        title: "Progress",
        subtitle: "XP, gems and streaks",
        icon: Trophy,
        tint: "bg-amber-500",
    },
    {
        id: "privacy",
        group: "You",
        title: "Privacy & legal",
        subtitle: "Public profile and policies",
        icon: Globe,
        tint: "bg-indigo-500",
    },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];
const GROUPS = ["Account", "Preferences", "You"] as const;
// Old /settings?tab=… links.
const LEGACY_TABS: Record<string, SectionId> = { profile: "account", prefs: "learning" };

const Settings = () => {
    const { user, loading, signOut } = useAuth();
    const [searchParams] = useSearchParams();
    const { section } = useParams();
    const navigate = useNavigate();
    const [islamic] = useIslamicSettings();
    // Typed daily goal, saved on "Save" (null = showing the saved value).
    const [goalDraft, setGoalDraft] = useState<string | null>(null);
    const { t, i18n } = useTranslation();
    const [p, setP] = useState<Profile | null>(null);
    const [busy, setBusy] = useState(false);

    const [emailInput, setEmailInput] = useState("");
    const [completedCount, setCompletedCount] = useState(0);
    const [courses, setCourses] = useState<{ id: string; title: string; is_public: boolean }[]>([]);

    useEffect(() => {
        if (!user) return;
        setEmailInput(user.email ?? "");
        (async () => {
            const [{ data: prof }, { data: prefs }, { data: prog }] = await Promise.all([
                supabase
                    .from("profiles")
                    .select("name,email,avatar_url,certificate_name,preferred_language")
                    .eq("id", user.id)
                    .maybeSingle(),
                supabase
                    .from("user_preferences")
                    .select(
                        "daily_goal_minutes,study_reminders_enabled,notify_email,notify_inactivity,notify_completion,profile_public",
                    )
                    .eq("user_id", user.id)
                    .maybeSingle(),
                supabase
                    .from("user_progress")
                    .select("total_gems,total_xp,current_streak,longest_streak")
                    .eq("user_id", user.id)
                    .maybeSingle(),
            ]);
            if (prof)
                setP({
                    ...prof,
                    daily_goal_minutes: prefs?.daily_goal_minutes ?? 20,
                    study_reminders_enabled: prefs?.study_reminders_enabled ?? true,
                    notify_email: prefs?.notify_email ?? true,
                    notify_inactivity: prefs?.notify_inactivity ?? true,
                    notify_completion: prefs?.notify_completion ?? true,
                    profile_public: prefs?.profile_public ?? true,
                    total_gems: prog?.total_gems ?? 0,
                    total_xp: prog?.total_xp ?? 0,
                    current_streak: prog?.current_streak ?? 0,
                    longest_streak: prog?.longest_streak ?? 0,
                } as Profile);
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
                <div className="container py-20 text-muted-foreground font-mono text-sm">
                    Loading…
                </div>
            </AppShell>
        );

    const update = (patch: Partial<Profile>) => setP({ ...p, ...patch });

    // Saves the profile and preferences; switches and selects call it right
    // away, text fields from their Save button.
    const persist = async (next: Profile) => {
        const prev = p;
        setP(next);
        setBusy(true);
        const [{ error: e1 }, { error: e2 }] = await Promise.all([
            supabase
                .from("profiles")
                .update({
                    name: next.name,
                    certificate_name: next.certificate_name,
                    preferred_language: next.preferred_language,
                })
                .eq("id", user.id),
            supabase
                .from("user_preferences")
                .update({
                    daily_goal_minutes: next.daily_goal_minutes,
                    study_reminders_enabled: next.study_reminders_enabled,
                    notify_email: next.notify_email,
                    notify_inactivity: next.notify_inactivity,
                    notify_completion: next.notify_completion,
                    profile_public: next.profile_public,
                })
                .eq("user_id", user.id),
        ]);
        setBusy(false);
        const error = e1 ?? e2;
        if (error) {
            setP(prev);
            toast.error(error.message);
            return;
        }
        toast.success(t("profile.saved"), { duration: 1500 });
        if (next.preferred_language !== i18n.language) i18n.changeLanguage(next.preferred_language);
    };
    const saveProfile = () => persist(p);
    const saveGoal = () => {
        const n = Math.max(5, Math.min(480, parseInt(goalDraft ?? "", 10) || p.daily_goal_minutes));
        setGoalDraft(null);
        persist({ ...p, daily_goal_minutes: n });
    };

    const uploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const path = `${user.id}/avatar-${Date.now()}.${file.name.split(".").pop()}`;
        const { error } = await supabase.storage
            .from("avatars")
            .upload(path, file, { upsert: true });
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

    const signOutHere = async () => {
        await signOut();
        navigate("/");
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

    const legacyTab = searchParams.get("tab");
    if (legacyTab && !section) {
        return <Navigate to={`/settings/${LEGACY_TABS[legacyTab] ?? legacyTab}`} replace />;
    }
    const open = SECTIONS.find((s) => s.id === section);
    if (section && !open) return <Navigate to="/settings" replace />;
    // Wide screens always show a section next to the list.
    const shown = open ?? SECTIONS[0];

    const valueOf: Partial<Record<SectionId, string>> = {
        learning: `${p.daily_goal_minutes} min`,
        islamic: islamic.enabled ? "On" : "Off",
        notifications: p.notify_email ? "On" : "Off",
        privacy: p.profile_public ? "Public" : "Private",
    };

    const initials = (p.name || user.email || "?").trim().charAt(0).toUpperCase();
    const avatar = (size: string) => (
        <div
            className={cn(
                "shrink-0 rounded-full bg-gradient-lime overflow-hidden flex items-center justify-center font-display text-primary-foreground",
                size,
            )}
        >
            {p.avatar_url ? (
                <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
                initials
            )}
        </div>
    );

    const saveButton = (onClick: () => void, disabled = false) => (
        <Button
            size="sm"
            onClick={onClick}
            disabled={busy || disabled}
            className="bg-gradient-lime text-primary-foreground hover:opacity-90"
        >
            {t("common.save")}
        </Button>
    );

    const list = (
        <div className="space-y-6">
            <Link
                to="/settings/account"
                className="flex items-center gap-4 rounded-2xl border border-border bg-card shadow-card p-4 hover:bg-muted/40 transition-colors"
            >
                {avatar("h-14 w-14 text-xl")}
                <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-base">
                        {p.name || "Your name"}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                        {user.email}
                    </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" />
            </Link>

            {GROUPS.map((g) => (
                <SettingsGroup key={g} title={g}>
                    {SECTIONS.filter((s) => s.group === g).map((s) => (
                        <SettingsNavRow
                            key={s.id}
                            to={`/settings/${s.id}`}
                            icon={s.icon}
                            tint={s.tint}
                            title={s.title}
                            subtitle={s.subtitle}
                            value={valueOf[s.id]}
                            active={shown.id === s.id}
                        />
                    ))}
                </SettingsGroup>
            ))}

            <SettingsGroup>
                <SettingsNavRow
                    icon={LogOut}
                    tint="bg-destructive"
                    title="Sign out"
                    destructive
                    onClick={signOutHere}
                />
            </SettingsGroup>
        </div>
    );

    const content: Record<SectionId, JSX.Element> = {
        account: (
            <>
                <SettingsGroup>
                    <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
                        {avatar("h-24 w-24 text-4xl")}
                        <label className="cursor-pointer">
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={uploadPhoto}
                            />
                            <span className="inline-flex items-center justify-center rounded-full border border-border bg-background/60 hover:bg-muted h-9 px-4 text-sm font-medium">
                                {t("profile.upload")}
                            </span>
                        </label>
                    </div>
                </SettingsGroup>

                <SettingsGroup
                    title="Profile"
                    footer="Your certificate name is printed on course certificates."
                >
                    <SettingsRow
                        title={t("profile.name")}
                        stack
                        control={
                            <Input
                                value={p.name ?? ""}
                                onChange={(e) => update({ name: e.target.value })}
                            />
                        }
                    />
                    <SettingsRow
                        title={t("profile.certificateName")}
                        stack
                        control={
                            <Input
                                value={p.certificate_name ?? ""}
                                onChange={(e) => update({ certificate_name: e.target.value })}
                            />
                        }
                    />
                    <div className="flex justify-end px-4 py-3">{saveButton(saveProfile)}</div>
                </SettingsGroup>

                <SettingsGroup
                    title="Email"
                    footer="A verification link will be sent to the new address."
                >
                    <SettingsRow
                        title={t("profile.email")}
                        stack
                        control={
                            <div className="flex gap-2">
                                <Input
                                    value={emailInput}
                                    onChange={(e) => setEmailInput(e.target.value)}
                                    type="email"
                                    autoComplete="email"
                                />
                                <Button
                                    variant="outline"
                                    onClick={changeEmail}
                                    disabled={!emailInput || emailInput === user.email}
                                >
                                    Update
                                </Button>
                            </div>
                        }
                    />
                </SettingsGroup>
            </>
        ),

        security: (
            <>
                <SettingsGroup title="Sign-in">
                    <SettingsRow
                        title="Signed in with Google"
                        description="Your password and recovery options are managed in your Google account."
                        control={
                            <a
                                href="https://myaccount.google.com/security"
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                            >
                                Manage <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                        }
                    />
                </SettingsGroup>
                <SettingsGroup title="Sessions">
                    <SettingsRow
                        title="Sign out on this device"
                        control={
                            <Button variant="outline" size="sm" onClick={signOutHere}>
                                Sign out
                            </Button>
                        }
                    />
                    <SettingsRow
                        title="Sign out everywhere"
                        description="Ends every active session on every device."
                        control={
                            <Button variant="outline" size="sm" onClick={signOutAll}>
                                Sign out all
                            </Button>
                        }
                    />
                </SettingsGroup>
            </>
        ),

        learning: (
            <>
                <SettingsGroup title="Language">
                    <SettingsRow
                        title={t("profile.language")}
                        description="Used across the app."
                        control={
                            <Select
                                value={p.preferred_language}
                                onValueChange={(v) => persist({ ...p, preferred_language: v })}
                            >
                                <SelectTrigger className="w-[150px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="en">English</SelectItem>
                                    <SelectItem value="bn">বাংলা (Bangla)</SelectItem>
                                </SelectContent>
                            </Select>
                        }
                    />
                </SettingsGroup>

                <SettingsGroup
                    title="Daily goal"
                    footer="Watch this many minutes a day to finish your daily mission and keep your streak going (5–480)."
                >
                    <SettingsRow
                        title="Minutes per day"
                        control={
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    inputMode="numeric"
                                    min={5}
                                    max={480}
                                    className="w-20 text-center"
                                    value={goalDraft ?? String(p.daily_goal_minutes)}
                                    onChange={(e) => setGoalDraft(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && saveGoal()}
                                />
                                {goalDraft !== null &&
                                    goalDraft !== String(p.daily_goal_minutes) &&
                                    saveButton(saveGoal)}
                            </div>
                        }
                    />
                </SettingsGroup>

                <SettingsGroup title="Reminders">
                    <SettingsRow
                        title="Study reminders"
                        description="A daily nudge to keep your streak alive."
                        control={
                            <Switch
                                checked={p.study_reminders_enabled}
                                onCheckedChange={(v) =>
                                    persist({ ...p, study_reminders_enabled: v })
                                }
                            />
                        }
                    />
                </SettingsGroup>
            </>
        ),

        islamic: <IslamicModeSettings />,

        notifications: (
            <>
                <SettingsGroup title="This device">
                    <PushToggle userId={user.id} />
                </SettingsGroup>
                <SettingsGroup title="Email">
                    {[
                        {
                            k: "notify_email" as const,
                            title: "Email notifications",
                            body: "Master switch for all email from ZverTs.",
                        },
                        {
                            k: "notify_inactivity" as const,
                            title: "Inactivity alerts",
                            body: "A nudge if you haven't studied in a few days.",
                        },
                        {
                            k: "notify_completion" as const,
                            title: "Completion emails",
                            body: "A recap when you finish a module or course.",
                        },
                    ].map((item) => (
                        <SettingsRow
                            key={item.k}
                            title={item.title}
                            description={item.body}
                            control={
                                <Switch
                                    checked={p[item.k]}
                                    onCheckedChange={(v) => persist({ ...p, [item.k]: v })}
                                />
                            }
                        />
                    ))}
                </SettingsGroup>
                <SmartNotificationSettings />
            </>
        ),

        progress: (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                    { label: "Total XP", value: p.total_xp.toLocaleString() },
                    { label: "Level", value: level },
                    { label: "Gems", value: p.total_gems.toLocaleString() },
                    { label: "Modules completed", value: completedCount },
                    { label: "Current streak", value: `${p.current_streak} days` },
                    { label: "Longest streak", value: `${p.longest_streak} days` },
                ].map((s) => (
                    <div
                        key={s.label}
                        className="rounded-2xl border border-border bg-card p-4 shadow-card"
                    >
                        <div className="text-xs font-medium text-muted-foreground">{s.label}</div>
                        <div className="font-display text-2xl md:text-3xl text-primary mt-1">
                            {s.value}
                        </div>
                    </div>
                ))}
            </div>
        ),

        privacy: (
            <>
                <SettingsGroup
                    title="Visibility"
                    footer="Each course's public/private switch lives in My courses."
                >
                    <SettingsRow
                        title="Public profile"
                        description="Show your name and avatar on the leaderboard and shared courses."
                        control={
                            <Switch
                                checked={p.profile_public}
                                onCheckedChange={(v) => persist({ ...p, profile_public: v })}
                            />
                        }
                    />
                </SettingsGroup>
                <SettingsGroup title="Legal">
                    {[
                        { to: "/privacy-policy", title: "Privacy Policy" },
                        { to: "/terms-of-service", title: "Terms of Service" },
                        { to: "/refund-policy", title: "Refund Policy" },
                    ].map((l) => (
                        <SettingsNavRow
                            key={l.to}
                            to={l.to}
                            icon={FileText}
                            tint="bg-zinc-500"
                            title={l.title}
                        />
                    ))}
                </SettingsGroup>
            </>
        ),
    };

    return (
        <AppShell>
            <section className="container max-w-5xl py-6 md:py-10">
                <div className="md:grid md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)] md:gap-8 md:items-start">
                    {/* List: the whole screen on phones until a section is opened. */}
                    <aside
                        className={cn(
                            open ? "hidden md:block" : "block",
                            "md:sticky md:top-[calc(var(--app-header-h)+1.5rem)]",
                        )}
                    >
                        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mb-5 px-1">
                            Settings
                        </h1>
                        {list}
                    </aside>

                    {/* Section */}
                    <div className={cn(open ? "block" : "hidden md:block", "min-w-0")}>
                        <Link
                            to="/settings"
                            className="md:hidden -ml-2 mb-2 inline-flex h-10 items-center gap-0.5 px-2 text-sm font-medium text-primary"
                        >
                            <ChevronLeft className="h-5 w-5" /> Settings
                        </Link>
                        <div className="mb-5 md:mt-1 px-1">
                            <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
                                {shown.title}
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">{shown.subtitle}</p>
                        </div>
                        <div
                            key={shown.id}
                            className="space-y-6 animate-in fade-in-0 slide-in-from-right-4 md:slide-in-from-right-0 duration-200"
                        >
                            {content[shown.id]}
                        </div>
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
                    <Link
                        to={`/courses/${c.id}`}
                        className="flex-1 truncate font-medium hover:text-primary"
                    >
                        {c.title}
                    </Link>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                        <span>{c.is_public ? "Public" : "Private"}</span>
                        <Switch checked={c.is_public} onCheckedChange={(v) => onToggle(c.id, v)} />
                    </div>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => setEditing(true)}
                    >
                        <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete "{c.title}"?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    The course and all its modules and progress will be permanently
                                    removed.
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
