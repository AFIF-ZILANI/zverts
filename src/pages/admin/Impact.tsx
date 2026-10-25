import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { RequireRole } from "@/components/RequireRole";
import { AppShell } from "@/components/app/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
    ArrowLeft,
    Award,
    BookOpen,
    CheckCircle2,
    Clock,
    Flame,
    Gem,
    GraduationCap,
    Library,
    NotebookPen,
    RefreshCw,
    Target,
    Users,
    Zap,
    type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const WeeklyActivityChart = lazy(() =>
    import("@/components/app/WeeklyActivityChart").then((m) => ({
        default: m.WeeklyActivityChart,
    })),
);

// Shape of public.admin_impact_stats().
type Impact = {
    courses: number;
    course_creators: number;
    videos: number;
    content_seconds: number;
    watch_seconds: number;
    watch_seconds_7d: number;
    modules_completed: number;
    certificates: number;
    badges: number;
    missions_completed: number;
    notes: number;
    learners: number;
    learners_new_30d: number;
    active_7d: number;
    active_30d: number;
    watchers: number;
    on_streak: number;
    longest_streak: number;
    xp: number;
    gems: number;
    daily_watch: { date: string; seconds: number }[];
    weekly_signups: { week: string; count: number }[];
    top_courses: {
        id: string;
        title: string;
        thumbnail_url: string | null;
        learners: number;
        watch_seconds: number;
        /** How many learners imported this playlist as their own course. */
        copies: number;
        completions: number;
    }[];
};

const num = (n: number) => n.toLocaleString();

/** 109666 → "30.5 h"; under an hour → "42 min". */
const hours = (seconds: number) => {
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    const h = seconds / 3600;
    return `${h < 100 ? h.toFixed(1) : num(Math.round(h))} h`;
};

const dayLabel = (iso: string) => String(Number(iso.slice(8, 10)));
const weekLabel = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
    });

const ImpactInner = () => {
    const [stats, setStats] = useState<Impact | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loadedAt, setLoadedAt] = useState<Date | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        setRefreshing(true);
        const { data, error } = await supabase.rpc("admin_impact_stats");
        setRefreshing(false);
        if (error) {
            setError(error.message);
            return;
        }
        setError(null);
        setStats(data as unknown as Impact);
        setLoadedAt(new Date());
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const s = stats;
    const watchedDays = s?.daily_watch.map((d) => ({
        day: dayLabel(d.date),
        minutes: Math.round(d.seconds / 60),
    }));
    const signupWeeks = s?.weekly_signups.map((w) => ({ day: weekLabel(w.week), minutes: w.count }));
    const minutes30d = watchedDays?.reduce((sum, d) => sum + d.minutes, 0) ?? 0;

    return (
        <AppShell>
            <section className="container max-w-6xl space-y-6 py-8 md:py-10">
                {/* ── Header ───────────────────────────────────────────────── */}
                <div>
                    <Link
                        to="/admin"
                        className="inline-flex items-center gap-1 font-mono text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="h-3 w-3" /> Back to Admin
                    </Link>
                    <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                                / admin · impact
                            </div>
                            <h1 className="mt-1.5 font-display text-3xl font-semibold tracking-tight md:text-4xl">
                                ZverTs Impact
                            </h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Everything learners have built and watched on ZverTs so far.
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            {loadedAt && (
                                <span className="font-mono text-xs text-muted-foreground">
                                    Updated{" "}
                                    {loadedAt.toLocaleTimeString([], {
                                        hour: "numeric",
                                        minute: "2-digit",
                                    })}
                                </span>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void load()}
                                disabled={refreshing}
                                className="gap-1.5 rounded-full"
                            >
                                <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                                Refresh
                            </Button>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive">
                        Couldn't load the impact numbers: {error}
                    </div>
                )}

                {!s ? (
                    !error && <ImpactSkeleton />
                ) : (
                    <>
                        {/* ── Headline ─────────────────────────────────────── */}
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Headline
                                icon={Clock}
                                tint="bg-sky-500/15 text-sky-500"
                                label="Hours watched"
                                value={hours(s.watch_seconds)}
                                sub={`${hours(s.watch_seconds_7d)} in the last 7 days`}
                            />
                            <Headline
                                icon={BookOpen}
                                tint="bg-primary/15 text-primary"
                                label="Courses created"
                                value={num(s.courses)}
                                sub={`by ${num(s.course_creators)} learners`}
                            />
                            <Headline
                                icon={Users}
                                tint="bg-violet-500/15 text-violet-500"
                                label="Learners"
                                value={num(s.learners)}
                                sub={`+${num(s.learners_new_30d)} in the last 30 days`}
                            />
                            <Headline
                                icon={CheckCircle2}
                                tint="bg-emerald-500/15 text-emerald-500"
                                label="Videos completed"
                                value={num(s.modules_completed)}
                                sub={`${num(s.certificates)} course certificate${s.certificates === 1 ? "" : "s"}`}
                            />
                        </div>

                        {/* ── Watch time trend ─────────────────────────────── */}
                        <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="text-sm font-medium text-muted-foreground">
                                        Watch time · last 30 days
                                    </div>
                                    <div className="mt-0.5 font-display text-[28px] font-semibold leading-tight tabular-nums">
                                        {num(minutes30d)}
                                        <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
                                            min watched
                                        </span>
                                    </div>
                                </div>
                                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium tabular-nums text-primary">
                                    {num(s.watchers)} learners have watched
                                </span>
                            </div>
                            <div className="mt-3">
                                <Suspense fallback={<div className="h-[180px]" />}>
                                    <WeeklyActivityChart data={watchedDays ?? []} height={180} />
                                </Suspense>
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                                Days follow Bangladesh time. Daily totals start from when genuine
                                watch tracking went live; the all-time hours above include earlier
                                viewing.
                            </p>
                        </div>

                        {/* ── Breakdown ────────────────────────────────────── */}
                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                            <Group title="Content library">
                                <Row icon={Library} label="Courses" value={num(s.courses)} />
                                <Row icon={BookOpen} label="Videos imported" value={num(s.videos)} />
                                <Row icon={Clock} label="Content available" value={hours(s.content_seconds)} />
                                <Row icon={Users} label="Course creators" value={num(s.course_creators)} />
                            </Group>
                            <Group title="Learning">
                                <Row icon={CheckCircle2} label="Videos completed" value={num(s.modules_completed)} />
                                <Row icon={GraduationCap} label="Certificates issued" value={num(s.certificates)} />
                                <Row icon={Award} label="Badges unlocked" value={num(s.badges)} />
                                <Row icon={Target} label="Daily missions completed" value={num(s.missions_completed)} />
                                <Row icon={NotebookPen} label="Notes written" value={num(s.notes)} />
                            </Group>
                            <Group title="Engagement">
                                <Row icon={Users} label="Active this week" value={num(s.active_7d)} />
                                <Row icon={Users} label="Active this month" value={num(s.active_30d)} />
                                <Row icon={Flame} label="On a live streak" value={num(s.on_streak)} />
                                <Row
                                    icon={Flame}
                                    label="Longest streak"
                                    value={`${num(s.longest_streak)} day${s.longest_streak === 1 ? "" : "s"}`}
                                />
                                <Row icon={Zap} label="XP earned" value={num(s.xp)} />
                                <Row icon={Gem} label="Gems earned" value={num(s.gems)} />
                            </Group>
                        </div>

                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
                            {/* ── Top courses ─────────────────────────────── */}
                            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
                                <div className="border-b border-border/60 px-5 py-4">
                                    <h2 className="text-base font-semibold">Most-watched courses</h2>
                                    <p className="text-xs text-muted-foreground">By total watch time</p>
                                </div>
                                {s.top_courses.length === 0 ? (
                                    <div className="p-8 text-center text-sm text-muted-foreground">
                                        No course has been watched yet.
                                    </div>
                                ) : (
                                    <ol className="divide-y divide-border/40">
                                        {s.top_courses.map((c, i) => (
                                            <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                                                <span className="w-4 shrink-0 text-right font-mono text-xs text-muted-foreground">
                                                    {i + 1}
                                                </span>
                                                <div className="aspect-video w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                                                    {c.thumbnail_url && (
                                                        <img
                                                            src={c.thumbnail_url}
                                                            alt=""
                                                            loading="lazy"
                                                            className="h-full w-full object-cover"
                                                        />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-sm font-medium">{c.title}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {num(c.learners)} learner{c.learners === 1 ? "" : "s"} ·{" "}
                                                        {num(c.completions)} video{c.completions === 1 ? "" : "s"} completed
                                                        {c.copies > 1 && ` · imported by ${num(c.copies)}`}
                                                    </div>
                                                </div>
                                                <span className="shrink-0 text-sm font-semibold tabular-nums">
                                                    {hours(c.watch_seconds)}
                                                </span>
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </div>

                            {/* ── Sign-ups ────────────────────────────────── */}
                            <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
                                <div className="text-sm font-medium text-muted-foreground">
                                    New learners · last 12 weeks
                                </div>
                                <div className="mt-0.5 font-display text-[28px] font-semibold leading-tight tabular-nums">
                                    {num(signupWeeks?.reduce((sum, w) => sum + w.minutes, 0) ?? 0)}
                                    <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
                                        joined
                                    </span>
                                </div>
                                <div className="mt-3">
                                    <Suspense fallback={<div className="h-[180px]" />}>
                                        <WeeklyActivityChart
                                            data={signupWeeks ?? []}
                                            unit="learners"
                                            label="Joined"
                                            height={180}
                                        />
                                    </Suspense>
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">Weeks start on Monday.</p>
                            </div>
                        </div>
                    </>
                )}
            </section>
        </AppShell>
    );
};

const Headline = ({
    icon: Icon,
    tint,
    label,
    value,
    sub,
}: {
    icon: LucideIcon;
    tint: string;
    label: string;
    value: string;
    sub: string;
}) => (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-muted-foreground">{label}</span>
            <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl", tint)}>
                <Icon className="h-4 w-4" />
            </span>
        </div>
        <div className="mt-2 font-display text-4xl font-semibold leading-none tracking-tight tabular-nums">
            {value}
        </div>
        <div className="mt-2 truncate text-xs text-muted-foreground">{sub}</div>
    </div>
);

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <h2 className="text-base font-semibold">{title}</h2>
        <dl className="mt-3 divide-y divide-border/40">{children}</dl>
    </div>
);

const Row = ({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) => (
    <div className="flex items-center justify-between gap-3 py-2.5">
        <dt className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
        </dt>
        <dd className="shrink-0 text-sm font-semibold tabular-nums">{value}</dd>
    </div>
);

const ImpactSkeleton = () => (
    <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[124px] rounded-3xl" />
            ))}
        </div>
        <Skeleton className="h-[300px] rounded-3xl" />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-60 rounded-3xl" />
            ))}
        </div>
    </div>
);

const AdminImpact = () => (
    <RequireRole role="admin">
        <ImpactInner />
    </RequireRole>
);
export default AdminImpact;
