import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, Link } from "react-router-dom";
import { AppShell } from "@/components/app/AppShell";
import { StatCard } from "@/components/app/StatCard";
import { ContinueWatching } from "@/components/app/ContinueWatching";
import { TodayMissionCard } from "@/components/app/TodayMissionCard";
import { ProgressRing } from "@/components/app/ProgressRing";
import { SectionTitle } from "@/components/app/SectionTitle";
import { LearningMap } from "@/components/app/LearningMap";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError, recall, remember } from "@/lib/offline/saved";
import {
    CheckSquare,
    ChevronRight,
    Clock,
    Flame,
    Gem,
    Play,
    Plus,
    Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIslamicSettings } from "@/lib/islamic/dailyAyah";

const WeeklyActivityChart = lazy(() =>
    import("@/components/app/WeeklyActivityChart").then((m) => ({
        default: m.WeeklyActivityChart,
    })),
);
const AnalyticsPanel = lazy(() =>
    import("@/components/app/AnalyticsPanel").then((m) => ({ default: m.AnalyticsPanel })),
);
const BadgesGrid = lazy(() =>
    import("@/components/app/BadgesGrid").then((m) => ({ default: m.BadgesGrid })),
);
// Islamic Mode only; the card carries the ayat data, so it loads only when on.
const DailyAyahCard = lazy(() => import("@/components/app/DailyAyahCard"));

interface CourseRow {
    id: string;
    title: string;
}
interface ModuleRow {
    id: string;
    course_id: string;
    position: number;
    title: string;
    duration_seconds: number;
}
interface ProgressRow {
    module_id: string;
    watch_time_seconds: number;
    percent_watched: number;
    completed: boolean;
    updated_at: string;
    completed_at: string | null;
}
interface UserStats {
    xp: number;
    gems: number;
    streak: number;
}

const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600),
        m = Math.floor((s % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m`;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Days follow Bangladesh time (UTC+6, no DST) to match watch_daily and the daily
// mission (public.app_today() in the database).
const DHAKA_OFFSET_MS = 6 * 3_600_000;
const dhakaDay = (ms: number) => new Date(ms + DHAKA_OFFSET_MS);
const dhakaDateKey = (ms: number) => dhakaDay(ms).toISOString().slice(0, 10);

const Dashboard = () => {
    const { user, loading: authLoading } = useAuth();
    const [islamic] = useIslamicSettings();
    const [courses, setCourses] = useState<CourseRow[]>([]);
    const [modules, setModules] = useState<ModuleRow[]>([]);
    const [progress, setProgress] = useState<ProgressRow[]>([]);
    // Genuine seconds watched per Bangladesh day (last 7 days), from record_watch_progress.
    const [dailyWatch, setDailyWatch] = useState<Map<string, number>>(new Map());
    const [userStats, setUserStats] = useState<UserStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = async (uid: string, opts: { silent?: boolean } = {}) => {
        if (!opts.silent) setLoading(true);
        setError(null);
        try {
            const [{ data: ownCourses, error: cErr }, { data: upData }] = await Promise.all([
                supabase
                    .from("courses")
                    .select("id,title")
                    .eq("user_id", uid)
                    .order("created_at", { ascending: false }),
                supabase
                    .from("user_progress")
                    .select("total_xp,total_gems,current_streak")
                    .eq("user_id", uid)
                    .maybeSingle(),
            ]);
            if (cErr) throw cErr;

            if (upData)
                setUserStats({
                    xp: upData.total_xp ?? 0,
                    gems: upData.total_gems ?? 0,
                    streak: upData.current_streak ?? 0,
                });

            const courseIds = (ownCourses ?? []).map((c) => c.id);
            const weekStart = dhakaDateKey(Date.now() - 6 * 86_400_000);
            const [
                { data: mods, error: mErr },
                { data: prog, error: pErr },
                { data: daily, error: dErr },
            ] = await Promise.all([
                courseIds.length
                    ? supabase
                          .from("modules")
                          .select("id,course_id,position,title,duration_seconds")
                          .in("course_id", courseIds)
                          .order("position")
                    : Promise.resolve({ data: [] as ModuleRow[], error: null } as {
                          data: ModuleRow[];
                          error: null;
                      }),
                supabase
                    .from("module_progress")
                    .select(
                        "module_id,watch_time_seconds,percent_watched,completed,updated_at,completed_at",
                    )
                    .eq("user_id", uid),
                supabase
                    .from("watch_daily")
                    .select("date,seconds")
                    .eq("user_id", uid)
                    .gte("date", weekStart),
            ]);
            if (mErr) throw mErr;
            if (pErr) throw pErr;
            // The weekly chart is secondary: if it can't load, show the rest of the dashboard.
            if (dErr) console.warn("watch_daily unavailable:", dErr.message);

            setCourses(ownCourses ?? []);
            setModules(mods ?? []);
            setProgress(prog ?? []);
            setDailyWatch(new Map((daily ?? []).map((d) => [d.date, d.seconds])));
            remember(uid, "dashboard", {
                courses: ownCourses ?? [],
                modules: mods ?? [],
                progress: prog ?? [],
                daily: daily ?? [],
                stats: upData,
            });
        } catch (e: unknown) {
            // Offline: show the last dashboard seen on this device.
            const saved = recall<{
                courses: CourseRow[];
                modules: ModuleRow[];
                progress: ProgressRow[];
                daily: { date: string; seconds: number }[];
                stats: { total_xp: number | null; total_gems: number | null; current_streak: number | null } | null;
            }>(uid, "dashboard");
            if (saved) {
                const d = saved.data;
                setCourses(d.courses);
                setModules(d.modules);
                setProgress(d.progress);
                setDailyWatch(new Map(d.daily.map((x) => [x.date, x.seconds])));
                if (d.stats)
                    setUserStats({
                        xp: d.stats.total_xp ?? 0,
                        gems: d.stats.total_gems ?? 0,
                        streak: d.stats.current_streak ?? 0,
                    });
            } else setError(friendlyError(e));
        } finally {
            if (!opts.silent) setLoading(false);
        }
    };

    useEffect(() => {
        if (!user) return;
        void load(user.id);
        const channel = supabase
            .channel(`dashboard:${user.id}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "module_progress",
                    filter: `user_id=eq.${user.id}`,
                },
                () => void load(user.id, { silent: true }),
            )
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "user_progress",
                    filter: `user_id=eq.${user.id}`,
                },
                () => void load(user.id, { silent: true }),
            )
            .subscribe();
        return () => {
            void supabase.removeChannel(channel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    const visibleModuleIds = new Set(modules.map((m) => m.id));
    const visibleProgress = progress.filter((e) => visibleModuleIds.has(e.module_id));
    const progByMod = new Map(visibleProgress.map((p) => [p.module_id, p]));
    const completedCount = visibleProgress.filter((p) => p.completed).length;
    const totalWatch = visibleProgress.reduce((s, p) => s + p.watch_time_seconds, 0);
    // Every finished module, including ones from courses since removed.
    const completedAt = useMemo(
        () => progress.filter((p) => p.completed).map((p) => p.completed_at ?? p.updated_at),
        [progress],
    );

    const courseSections = useMemo(() => {
        const map = new Map(visibleProgress.map((p) => [p.module_id, p]));
        return courses.map((course) => {
            const courseModules = modules
                .filter((m) => m.course_id === course.id)
                .sort((a, b) => a.position - b.position);
            const cards = courseModules.map((module, idx) => {
                const p = map.get(module.id);
                const prev = idx === 0 ? null : courseModules[idx - 1];
                const prevDone = !prev || map.get(prev.id)?.completed;
                let state: "locked" | "available" | "in_progress" | "completed" = "locked";
                if (p?.completed) state = "completed";
                else if (prevDone && p && p.percent_watched > 0) state = "in_progress";
                else if (prevDone) state = "available";
                return { ...module, state, percent: p?.percent_watched ?? 0 };
            });
            return { course, cards };
        });
    }, [courses, modules, visibleProgress]);

    if (authLoading) return null;
    if (!user) return <Navigate to="/auth" replace />;

    const nextModule = courseSections
        .flatMap((s) => s.cards.map((c) => ({ ...c, courseTitle: s.course.title })))
        .find((m) => m.state === "available" || m.state === "in_progress");
    const displayName =
        (user.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
        (user.user_metadata?.name as string | undefined)?.split(" ")[0] ??
        user.email?.split("@")[0] ??
        "there";

    const weekly = Array.from({ length: 7 }, (_, i) => {
        const ms = Date.now() - (6 - i) * 86_400_000;
        const minutes = Math.floor((dailyWatch.get(dhakaDateKey(ms)) ?? 0) / 60);
        return { day: DAYS[dhakaDay(ms).getUTCDay()], minutes };
    });

    const level = userStats ? Math.floor(userStats.xp / 500) + 1 : 1;
    const xpInLevel = (userStats?.xp ?? 0) % 500;
    const activeDays = weekly.filter((d) => d.minutes > 0).length;
    const weekMinutes = weekly.reduce((s, d) => s + d.minutes, 0);

    const hour = new Date().getHours();
    const greeting =
        hour >= 5 && hour < 12
            ? "Good morning"
            : hour >= 12 && hour < 17
              ? "Good afternoon"
              : "Good evening";
    const today = new Date().toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
    });

    return (
        <AppShell>
            <section className="container max-w-6xl space-y-6 py-5 md:py-10">
                {/* ── Hero ─────────────────────────────────────────────────────── */}
                <div className="rounded-[28px] border border-border bg-card shadow-card">
                    <div className="p-5 sm:p-7">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-sm text-muted-foreground">{today}</p>
                                <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight tracking-tight sm:text-4xl">
                                    {greeting}, <span className="text-primary">{displayName}</span>
                                </h1>
                                <p className="mt-1.5 text-sm text-muted-foreground">
                                    {userStats
                                        ? `${(500 - xpInLevel).toLocaleString()} XP to level ${level + 1}`
                                        : "Loading your progress…"}
                                </p>
                            </div>
                            <ProgressRing value={(xpInLevel / 500) * 100} size={68} stroke={6}>
                                <span className="text-[10px] font-medium uppercase leading-none text-muted-foreground">
                                    Level
                                </span>
                                <span className="text-xl font-semibold leading-tight tabular-nums">
                                    {level}
                                </span>
                            </ProgressRing>
                        </div>

                        <div className="lg:mt-5 lg:grid lg:grid-cols-2 lg:items-center lg:gap-4">
                            {/* Quick stats */}
                            <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-md lg:mt-0 lg:max-w-none">
                                {userStats
                                    ? [
                                          {
                                              icon: Flame,
                                              value: userStats.streak,
                                              label:
                                                  userStats.streak > 0 ? "Day streak" : "No streak",
                                              tint: "text-orange-500",
                                          },
                                          {
                                              icon: Gem,
                                              value: userStats.gems.toLocaleString(),
                                              label: "Gems",
                                              tint: "text-sky-500",
                                          },
                                          {
                                              icon: Zap,
                                              value: userStats.xp.toLocaleString(),
                                              label: "Total XP",
                                              tint: "text-yellow-500",
                                          },
                                      ].map((s) => (
                                          <div
                                              key={s.label}
                                              className="rounded-2xl bg-muted/60 px-3 py-2.5"
                                          >
                                              <div className="flex items-center gap-1.5">
                                                  <s.icon className={cn("h-4 w-4", s.tint)} />
                                                  <span className="text-base font-semibold tabular-nums">
                                                      {s.value}
                                                  </span>
                                              </div>
                                              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                                  {s.label}
                                              </div>
                                          </div>
                                      ))
                                    : [0, 1, 2].map((i) => (
                                          <Skeleton key={i} className="h-[60px] rounded-2xl" />
                                      ))}
                            </div>

                            {/* Up next */}
                            {nextModule ? (
                                <Link
                                    to={`/learn/${nextModule.id}`}
                                    className="mt-4 flex items-center gap-3 rounded-2xl bg-gradient-lime p-3.5 text-primary-foreground shadow-glow transition-transform active:scale-[0.99] sm:max-w-xl lg:mt-0 lg:max-w-none"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-xs font-medium opacity-80">
                                            Up next · {nextModule.courseTitle}
                                        </div>
                                        <div className="mt-0.5 truncate font-semibold">
                                            {nextModule.title}
                                        </div>
                                        {nextModule.percent > 0 && (
                                            <div className="mt-2 h-1 overflow-hidden rounded-full bg-black/15">
                                                <div
                                                    className="h-full rounded-full bg-primary-foreground"
                                                    style={{
                                                        width: `${Math.min(100, nextModule.percent)}%`,
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-foreground text-primary shadow-md">
                                        <Play className="ml-0.5 h-5 w-5 fill-current" />
                                    </span>
                                </Link>
                            ) : (
                                !loading &&
                                !error &&
                                courses.length === 0 && (
                                    <Link
                                        to="/courses"
                                        className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-3.5 transition-colors hover:bg-primary/10 sm:max-w-xl lg:mt-0 lg:max-w-none"
                                    >
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                                            <Plus className="h-5 w-5" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="font-semibold">
                                                Start your first course
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                Import a YouTube playlist to get started
                                            </div>
                                        </div>
                                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                                    </Link>
                                )
                            )}
                        </div>
                    </div>
                </div>

                {islamic.enabled && (
                    <Suspense fallback={<Skeleton className="h-52 rounded-3xl" />}>
                        <DailyAyahCard />
                    </Suspense>
                )}

                {error ? (
                    <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive">
                        {error}
                    </div>
                ) : loading ? (
                    <DashboardSkeleton />
                ) : (
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
                        <div className="min-w-0 space-y-6">
                            {/* ── Mission ──────────────────────────────────────── */}
                            <TodayMissionCard userId={user.id} />

                            {/* ── Continue Watching ────────────────────────────── */}
                            <ContinueWatching userId={user.id} />

                            {/* ── Progress ─────────────────────────────────────── */}
                            <section>
                                <SectionTitle title="Your progress" />
                                {/* Streak sits in the hero and active days on the week card below. */}
                                <div className="grid grid-cols-2 gap-3">
                                    <StatCard
                                        icon={CheckSquare}
                                        label="Completed"
                                        value={completedCount}
                                        sub={`of ${modules.length} modules`}
                                        tint="bg-emerald-500/15 text-emerald-500"
                                    />
                                    <StatCard
                                        icon={Clock}
                                        label="Watch time"
                                        value={fmtTime(totalWatch)}
                                        sub="across all modules"
                                        tint="bg-sky-500/15 text-sky-500"
                                    />
                                </div>

                                <div className="mt-3 rounded-3xl border border-border bg-card p-5 shadow-card">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-medium text-muted-foreground">
                                                This week
                                            </div>
                                            <div className="mt-0.5 font-display text-[28px] font-semibold leading-tight tabular-nums">
                                                {weekMinutes}
                                                <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
                                                    min watched
                                                </span>
                                            </div>
                                        </div>
                                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary tabular-nums">
                                            {activeDays}/7 days active
                                        </span>
                                    </div>
                                    <div className="mt-3">
                                        <Suspense fallback={<div className="h-[150px]" />}>
                                            <WeeklyActivityChart data={weekly} />
                                        </Suspense>
                                    </div>
                                </div>
                            </section>
                        </div>

                        <aside className="flex min-w-0 flex-col gap-6">
                            {/* Last on phones, first in the desktop side column. */}
                            <div className="order-last lg:order-first">
                                <LearningMap completedAt={completedAt} />
                            </div>
                            <Suspense fallback={<Skeleton className="h-56 rounded-3xl" />}>
                                <BadgesGrid userId={user.id} />
                            </Suspense>
                            <Suspense fallback={<Skeleton className="h-56 rounded-3xl" />}>
                                <AnalyticsPanel userId={user.id} />
                            </Suspense>
                        </aside>
                    </div>
                )}
            </section>
        </AppShell>
    );
};

const DashboardSkeleton = () => (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
            <Skeleton className="h-[100px] rounded-3xl" />
            <div className="grid grid-cols-2 gap-3">
                {[0, 1].map((i) => (
                    <Skeleton key={i} className="h-[108px] rounded-2xl" />
                ))}
            </div>
            <Skeleton className="h-60 rounded-3xl" />
        </div>
        <div className="space-y-6">
            <Skeleton className="h-56 rounded-3xl" />
            <Skeleton className="h-56 rounded-3xl" />
        </div>
    </div>
);

export default Dashboard;
