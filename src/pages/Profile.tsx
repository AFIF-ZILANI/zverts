import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { announceProfileUpdate } from "@/hooks/useMyProfile";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsGroup, SettingsNavRow, SettingsRow } from "@/components/app/settings/SettingsUI";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
    Camera,
    Flame,
    Gem,
    Globe,
    Loader2,
    Lock,
    Medal,
    Settings as SettingsGear,
    Star,
    TrendingUp,
    Trophy,
    Zap,
} from "lucide-react";

const BadgesGrid = lazy(() =>
    import("@/components/app/BadgesGrid").then((m) => ({ default: m.BadgesGrid })),
);

const Profile = () => {
    const { user, loading } = useAuth();
    const { t } = useTranslation();
    const [name, setName] = useState("");
    const [certName, setCertName] = useState("");
    const [avatar, setAvatar] = useState<string | null>(null);
    const [stats, setStats] = useState({
        total_xp: 0,
        total_gems: 0,
        current_streak: 0,
        longest_streak: 0,
        profile_public: true,
    });
    const [busy, setBusy] = useState(false);
    const [uploading, setUploading] = useState(false);
    // Last saved values, so Save only lights up when something changed.
    const [saved, setSaved] = useState({ name: "", certName: "" });

    const firstName = useMemo(() => {
        const source =
            name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Learner";
        return source.split(" ")[0];
    }, [name, user]);

    const level = Math.floor(stats.total_xp / 500) + 1;

    useEffect(() => {
        if (!user) return;
        Promise.all([
            supabase
                .from("profiles")
                .select("name,certificate_name,avatar_url")
                .eq("id", user.id)
                .maybeSingle(),
            supabase
                .from("user_progress")
                .select("total_xp,total_gems,current_streak,longest_streak")
                .eq("user_id", user.id)
                .maybeSingle(),
            supabase
                .from("user_preferences")
                .select("profile_public")
                .eq("user_id", user.id)
                .maybeSingle(),
        ]).then(([{ data: prof }, { data: prog }, { data: pref }]) => {
            setName(prof?.name ?? "");
            setCertName(prof?.certificate_name ?? "");
            setSaved({ name: prof?.name ?? "", certName: prof?.certificate_name ?? "" });
            setAvatar(prof?.avatar_url ?? null);
            setStats({
                total_xp: prog?.total_xp ?? 0,
                total_gems: prog?.total_gems ?? 0,
                current_streak: prog?.current_streak ?? 0,
                longest_streak: prog?.longest_streak ?? 0,
                profile_public: pref?.profile_public ?? true,
            });
        });
    }, [user]);

    if (loading) return null;
    if (!user) return <Navigate to="/auth" replace />;

    const save = async () => {
        setBusy(true);
        await supabase
            .from("profiles")
            .update({ name, certificate_name: certName })
            .eq("id", user.id);
        setBusy(false);
        setSaved({ name, certName });
        announceProfileUpdate({ name });
        toast.success(t("profile.saved"));
    };

    const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        const path = `${user.id}/avatar-${Date.now()}.${file.name.split(".").pop()}`;
        const { error } = await supabase.storage
            .from("avatars")
            .upload(path, file, { upsert: true });
        if (error) {
            setUploading(false);
            toast.error(error.message);
            return;
        }
        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
        setAvatar(data.publicUrl);
        announceProfileUpdate({ avatar_url: data.publicUrl });
        setUploading(false);
        toast.success("Photo updated");
    };

    const dirty = name !== saved.name || certName !== saved.certName;
    const xpInLevel = stats.total_xp % 500;
    const visibility = stats.profile_public ? "Public" : "Private";

    return (
        <AppShell>
            <section className="container max-w-4xl space-y-6 py-5 md:py-10">
                {/* ── Header: cover, avatar, name, stats ───────────────────── */}
                <div className="overflow-hidden rounded-[28px] border border-border bg-card shadow-card">
                    <img
                        src="/profile-banner.webp"
                        alt=""
                        className="block aspect-[1500/420] max-h-48 w-full bg-[#0c0f0e] object-cover"
                    />
                    <div className="px-5 pb-5 sm:px-7 sm:pb-7">
                        <div className="-mt-12 flex items-end justify-between gap-3 sm:-mt-14">
                            <label
                                className="group relative cursor-pointer"
                                title={t("profile.upload")}
                            >
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={upload}
                                    disabled={uploading}
                                />
                                <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-gradient-lime font-display text-4xl text-primary-foreground ring-4 ring-card sm:h-28 sm:w-28">
                                    {avatar ? (
                                        <img
                                            src={avatar}
                                            alt="Profile avatar"
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        firstName.charAt(0).toUpperCase()
                                    )}
                                </span>
                                <span className="absolute bottom-0.5 right-0.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-foreground text-background shadow-md transition-transform group-hover:scale-110">
                                    {uploading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Camera className="h-4 w-4" />
                                    )}
                                </span>
                                <span className="sr-only">{t("profile.upload")}</span>
                            </label>
                            <Link
                                to="/settings"
                                className="mb-1 inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background/70 px-4 text-sm font-medium hover:bg-muted"
                            >
                                <SettingsGear className="h-4 w-4" /> Settings
                            </Link>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight sm:text-3xl">
                                {name || firstName}
                            </h1>
                            <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                                Level {level}
                            </span>
                        </div>
                        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                                {stats.profile_public ? (
                                    <Globe className="h-3.5 w-3.5" />
                                ) : (
                                    <Lock className="h-3.5 w-3.5" />
                                )}
                                {visibility} profile
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <Medal className="h-3.5 w-3.5" /> Best streak {stats.longest_streak}{" "}
                                day{stats.longest_streak !== 1 ? "s" : ""}
                            </span>
                        </div>

                        {/* Stats */}
                        <div className="mt-5 grid grid-cols-4 divide-x divide-border rounded-2xl bg-muted/50">
                            {[
                                { icon: Star, label: "Level", value: level, tint: "text-primary" },
                                {
                                    icon: Zap,
                                    label: "XP",
                                    value: stats.total_xp.toLocaleString(),
                                    tint: "text-yellow-500",
                                },
                                {
                                    icon: Gem,
                                    label: "Gems",
                                    value: stats.total_gems.toLocaleString(),
                                    tint: "text-sky-500",
                                },
                                {
                                    icon: Flame,
                                    label: "Streak",
                                    value: stats.current_streak,
                                    tint: "text-orange-500",
                                },
                            ].map((s) => (
                                <div
                                    key={s.label}
                                    className="flex flex-col items-center gap-0.5 px-1 py-3"
                                >
                                    <s.icon className={cn("h-4 w-4", s.tint)} />
                                    <span className="text-base font-semibold tabular-nums">
                                        {s.value}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground">
                                        {s.label}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Level progress */}
                        <div className="mt-4">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-medium">Level {level}</span>
                                <span className="tabular-nums text-muted-foreground">
                                    {xpInLevel} / 500 XP
                                </span>
                            </div>
                            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-gradient-lime transition-[width] duration-700"
                                    style={{ width: `${(xpInLevel / 500) * 100}%` }}
                                />
                            </div>
                            <p className="mt-1.5 text-xs text-muted-foreground">
                                {500 - xpInLevel} XP to level {level + 1}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
                    {/* ── Edit details ─────────────────────────────────────── */}
                    <SettingsGroup
                        title="Profile details"
                        footer="Your certificate name is printed on course certificates."
                    >
                        <SettingsRow
                            title={t("profile.name")}
                            stack
                            control={
                                <Input value={name} onChange={(e) => setName(e.target.value)} />
                            }
                        />
                        <SettingsRow
                            title={t("profile.certificateName")}
                            stack
                            control={
                                <Input
                                    value={certName}
                                    onChange={(e) => setCertName(e.target.value)}
                                    placeholder={name || user.email}
                                />
                            }
                        />
                        <SettingsRow
                            title={t("profile.email")}
                            stack
                            control={<Input value={user.email ?? ""} disabled />}
                        />
                        <div className="px-4 py-3">
                            <Button
                                onClick={save}
                                disabled={busy || !dirty}
                                className="w-full bg-gradient-lime text-primary-foreground shadow-glow hover:opacity-90"
                            >
                                {busy ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    t("common.save")
                                )}
                            </Button>
                        </div>
                    </SettingsGroup>

                    <div className="space-y-6">
                        <Suspense fallback={<Skeleton className="h-56 rounded-3xl" />}>
                            <BadgesGrid userId={user.id} />
                        </Suspense>

                        <SettingsGroup title="Account">
                            <SettingsNavRow
                                to="/settings/privacy"
                                icon={stats.profile_public ? Globe : Lock}
                                tint="bg-indigo-500"
                                title="Profile visibility"
                                value={visibility}
                            />
                            <SettingsNavRow
                                to="/settings/progress"
                                icon={TrendingUp}
                                tint="bg-emerald-500"
                                title="Learning progress"
                            />
                            <SettingsNavRow
                                to="/leaderboard"
                                icon={Trophy}
                                tint="bg-amber-500"
                                title="Leaderboard"
                            />
                        </SettingsGroup>
                    </div>
                </div>
            </section>
        </AppShell>
    );
};
export default Profile;
