import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { AppShell } from "@/components/app/AppShell";
import { SEO } from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError, recall, remember } from "@/lib/offline/saved";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressRing } from "@/components/app/ProgressRing";
import { SectionTitle } from "@/components/app/SectionTitle";
import { cn } from "@/lib/utils";
import { rankRows, medalColor, type RankRow, type RankedRow } from "@/lib/ranking";
import {
    ArrowRight,
    Check,
    CheckCircle2,
    ChevronRight,
    Clock,
    Crown,
    Flame,
    Gem,
    Minus,
    PlayCircle,
    Sparkles,
    Target,
    TrendingDown,
    TrendingUp,
    Trophy,
} from "lucide-react";

// ── Domain types ────────────────────────────────────────────────────────────

type Task = {
    kind: "lesson" | "watch";
    title: string;
    done: boolean;
    module_id?: string;
    course_id?: string;
    /** watch task: daily goal and genuine minutes watched so far today */
    goal_minutes?: number;
    progress_minutes?: number;
};

type Mission = {
    date: string;
    tasks: Task[];
    total: number;
    done: number;
    completed_at: string | null;
    rewarded_at: string | null;
};

type DayStats = { lessons: number; minutes: number };
type GrowthData = { today: DayStats; yesterday: DayStats };

const pct = (today: number, yest: number) => {
    if (yest === 0 && today === 0) return 0;
    if (yest === 0) return 100;
    return Math.round(((today - yest) / yest) * 100);
};

const Trend = ({ today, yest }: { today: number; yest: number }) => {
    const p = pct(today, yest);
    const [Icon, cls, text] =
        p > 0
            ? [TrendingUp, "bg-emerald-500/15 text-emerald-500", `+${p}%`]
            : p < 0
              ? [TrendingDown, "bg-red-500/15 text-red-500", `${p}%`]
              : [Minus, "bg-muted text-muted-foreground", "0%"];
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                cls,
            )}
        >
            <Icon className="h-3.5 w-3.5" />
            {text}
        </span>
    );
};

// ── Sub-components ──────────────────────────────────────────────────────────

const GrowthCell = ({
    icon: Icon,
    label,
    unit,
    tint,
    today,
    yest,
}: {
    icon: typeof PlayCircle;
    label: string;
    unit: string;
    tint: string;
    today: number;
    yest: number;
}) => {
    const max = Math.max(today, yest, 1);
    return (
        <div className="rounded-2xl bg-muted/50 p-4">
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <span
                        className={cn("flex h-8 w-8 items-center justify-center rounded-xl", tint)}
                    >
                        <Icon className="h-4 w-4" />
                    </span>
                    {label}
                </span>
                <Trend today={today} yest={yest} />
            </div>
            <div className="mt-3 font-display text-4xl font-semibold leading-none tabular-nums">
                {today}
                <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
                    {unit} today
                </span>
            </div>
            {/* Today vs yesterday, to scale */}
            <div className="mt-4 space-y-2 text-[11px] text-muted-foreground">
                {[
                    { k: "Today", v: today, bar: "bg-gradient-lime" },
                    { k: "Yesterday", v: yest, bar: "bg-muted-foreground/40" },
                ].map((r) => (
                    <div key={r.k} className="flex items-center gap-2">
                        <span className="w-16 shrink-0">{r.k}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-background/70">
                            <span
                                className={cn(
                                    "block h-full rounded-full transition-[width] duration-700",
                                    r.bar,
                                )}
                                style={{ width: `${(r.v / max) * 100}%` }}
                            />
                        </span>
                        <span className="w-8 shrink-0 text-right tabular-nums">{r.v}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const Avatar = ({ r, className }: { r: RankedRow; className?: string }) => (
    <span
        className={cn(
            "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-muted-foreground",
            className,
        )}
    >
        {r.avatar_url ? (
            <img src={r.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
            (r.name ?? "?").charAt(0).toUpperCase()
        )}
    </span>
);

const LbMiniRow = ({ r, isMe }: { r: RankedRow; isMe: boolean }) => (
    <div
        className={cn(
            "flex items-center gap-3 px-4 py-3 transition-colors sm:px-5",
            isMe && "bg-primary/10",
        )}
    >
        <span
            className={cn(
                "w-7 shrink-0 text-center text-sm font-semibold tabular-nums",
                medalColor(r.rank),
            )}
        >
            {r.rank}
        </span>
        <Avatar r={r} className="h-9 w-9 text-sm" />
        <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">
                {r.name ?? "—"}
                {isMe && (
                    <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                        You
                    </span>
                )}
            </div>
            <div className="text-[11px] text-muted-foreground">
                Level {r.level}
                <span className="hidden sm:inline"> · {r.xp.toLocaleString()} XP</span>
            </div>
        </div>
        <span
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium tabular-nums text-orange-500"
            title="Streak"
        >
            <Flame className="h-3.5 w-3.5" />
            {r.streak}
        </span>
        <span
            className="inline-flex w-12 shrink-0 items-center justify-end gap-1 text-xs font-medium tabular-nums text-sky-500"
            title="Gems"
        >
            <Gem className="h-3.5 w-3.5" />
            {r.gems}
        </span>
    </div>
);

/** Top three on a podium: 2nd, 1st, 3rd. */
const Podium = ({ rows, meId }: { rows: RankedRow[]; meId: string }) => {
    const order = [rows[1], rows[0], rows[2]];
    const style = [
        { h: "h-16", ring: "ring-slate-300", size: "h-14 w-14 text-lg", bar: "from-slate-300/40" },
        {
            h: "h-24",
            ring: "ring-amber-400",
            size: "h-[72px] w-[72px] text-xl",
            bar: "from-amber-400/40",
        },
        {
            h: "h-12",
            ring: "ring-orange-400",
            size: "h-14 w-14 text-lg",
            bar: "from-orange-400/40",
        },
    ];
    return (
        <div className="grid grid-cols-3 items-end gap-2 px-4 pt-5 sm:gap-4 sm:px-8">
            {order.map((r, i) => (
                <div key={r.id} className="flex min-w-0 flex-col items-center text-center">
                    <div className="relative">
                        {r.rank === 1 && (
                            <Crown className="absolute -top-5 left-1/2 h-5 w-5 -translate-x-1/2 fill-amber-400 text-amber-400" />
                        )}
                        <Avatar r={r} className={cn(style[i].size, "ring-[3px]", style[i].ring)} />
                    </div>
                    <div className="mt-2 w-full truncate text-sm font-semibold">
                        {r.name ?? "—"}
                        {r.id === meId && <span className="text-primary"> (you)</span>}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
                        <span className="inline-flex items-center gap-0.5 text-orange-500">
                            <Flame className="h-3 w-3" />
                            {r.streak}
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-sky-500">
                            <Gem className="h-3 w-3" />
                            {r.gems}
                        </span>
                    </div>
                    <div
                        className={cn(
                            "mt-2 flex w-full items-start justify-center rounded-t-2xl bg-gradient-to-b to-transparent pt-2 font-display text-2xl font-semibold",
                            style[i].h,
                            style[i].bar,
                        )}
                    >
                        {r.rank}
                    </div>
                </div>
            ))}
        </div>
    );
};

// ── Page ────────────────────────────────────────────────────────────────────

const Growth = () => {
    const { user, loading: authLoading } = useAuth();
    const [mission, setMission] = useState<Mission | null>(null);
    const [growth, setGrowth] = useState<GrowthData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lbRows, setLbRows] = useState<RankRow[]>([]);
    const [lbLoading, setLbLoading] = useState(true);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError(null);
        try {
            const [m, g] = await Promise.all([
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                supabase.rpc("get_today_mission" as any),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                supabase.rpc("get_growth_stats" as any),
            ]);
            if (m.error) throw m.error;
            if (g.error) throw g.error;
            setMission(m.data as Mission);
            setGrowth(g.data as GrowthData);
            if (user) remember(user.id, "growth", { mission: m.data, growth: g.data });
        } catch (e: unknown) {
            // Offline: show the last mission and stats seen on this device.
            const saved = user && recall<{ mission: Mission; growth: GrowthData }>(user.id, "growth");
            if (saved) {
                setMission(saved.data.mission);
                setGrowth(saved.data.growth);
            } else setError(friendlyError(e));
        } finally {
            setLoading(false);
        }
    }, [user]);

    const loadLeaderboard = useCallback(async () => {
        const { data } = await supabase.rpc("list_public_profiles", { _limit: 100 });
        setLbRows((data ?? []) as RankRow[]);
        setLbLoading(false);
    }, []);

    useEffect(() => {
        if (!user) return;
        void load();
        void loadLeaderboard();
        const ch = supabase
            .channel(`growth:${user.id}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "module_progress",
                    filter: `user_id=eq.${user.id}`,
                },
                () => void load(true),
            )
            .subscribe();
        return () => {
            void supabase.removeChannel(ch);
        };
    }, [user, load, loadLeaderboard]);

    const progressPct = useMemo(() => {
        if (!mission || mission.total === 0) return 0;
        return Math.round((mission.done / mission.total) * 100);
    }, [mission]);

    const ranked = useMemo(() => rankRows(lbRows), [lbRows]);
    const top10 = useMemo(() => ranked.slice(0, 10), [ranked]);
    const myRow = useMemo(() => ranked.find((r) => r.id === user?.id), [ranked, user]);

    if (authLoading) return null;
    if (!user) return <Navigate to="/auth" replace />;

    const tasksLeft = (mission?.total ?? 0) - (mission?.done ?? 0);
    const podium = top10.length >= 3 ? top10.slice(0, 3) : [];
    const listRows = podium.length ? top10.slice(3) : top10;

    return (
        <AppShell>
            <SEO
                title="Your Growth · ZverTs"
                description="Today's mission and personal growth — become better than yesterday."
            />
            <section className="container max-w-4xl space-y-6 py-5 md:py-10">
                {/* ── Header ──────────────────────────────────────────────────────── */}
                <div className="px-1">
                    <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight md:text-4xl">
                        Be better than <span className="text-primary">yesterday</span>
                    </h1>
                    <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                        No shortcuts — one day at a time. Hit today's mission, watch yourself
                        compound.
                    </p>
                </div>

                {loading ? (
                    <div className="space-y-6">
                        <Skeleton className="h-72 rounded-[28px]" />
                        <Skeleton className="h-56 rounded-3xl" />
                    </div>
                ) : error ? (
                    <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
                        {error}
                    </div>
                ) : (
                    <>
                        {/* ── Today's Mission ─────────────────────────────────────────── */}
                        <div
                            className={cn(
                                "relative overflow-hidden rounded-[28px] border bg-card p-5 shadow-card sm:p-7",
                                mission?.rewarded_at ? "border-primary/40" : "border-border",
                            )}
                        >
                            <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
                            <div className="relative flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                                        <Target className="h-4 w-4 text-primary" /> Today's mission
                                    </div>
                                    <h2 className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold sm:text-3xl">
                                        {mission?.rewarded_at ? (
                                            <>
                                                <Trophy className="h-6 w-6 text-primary" /> Mission
                                                complete!
                                            </>
                                        ) : (
                                            "Today's goal"
                                        )}
                                    </h2>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {!mission?.total
                                            ? "Start a course to get a daily mission."
                                            : tasksLeft > 0
                                              ? `${tasksLeft} task${tasksLeft !== 1 ? "s" : ""} left · +50 XP & +10 Gems when done`
                                              : "All tasks done for today"}
                                    </p>
                                </div>
                                <ProgressRing value={progressPct} size={88} stroke={8}>
                                    <span className="text-xl font-semibold leading-none tabular-nums">
                                        {mission?.done ?? 0}
                                        <span className="text-muted-foreground">
                                            /{mission?.total ?? 0}
                                        </span>
                                    </span>
                                    <span className="mt-0.5 text-[10px] text-muted-foreground">
                                        {progressPct}%
                                    </span>
                                </ProgressRing>
                            </div>

                            {!mission?.tasks?.length ? (
                                <Link
                                    to="/courses"
                                    className="relative mt-5 flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-primary/40 bg-primary/5 py-5 text-sm font-medium text-primary hover:bg-primary/10"
                                >
                                    No tasks yet — start a course{" "}
                                    <ChevronRight className="h-4 w-4" />
                                </Link>
                            ) : (
                                <ul className="relative mt-5 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background/40">
                                    {mission.tasks.map((t, i) => {
                                        const Icon = t.kind === "lesson" ? PlayCircle : Clock;
                                        const href =
                                            t.kind === "lesson" && t.module_id
                                                ? `/learn/${t.module_id}`
                                                : "/dashboard";
                                        const goal = t.goal_minutes ?? 0;
                                        const watched = Math.min(t.progress_minutes ?? 0, goal);
                                        const body = (
                                            <>
                                                <span
                                                    className={cn(
                                                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                                                        t.done
                                                            ? "bg-emerald-500 text-white"
                                                            : t.kind === "lesson"
                                                              ? "bg-violet-500/15 text-violet-500"
                                                              : "bg-sky-500/15 text-sky-500",
                                                    )}
                                                >
                                                    {t.done ? (
                                                        <Check
                                                            className="h-5 w-5"
                                                            strokeWidth={3}
                                                        />
                                                    ) : (
                                                        <Icon className="h-5 w-5" />
                                                    )}
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span
                                                        className={cn(
                                                            "block truncate text-[15px] font-medium",
                                                            t.done &&
                                                                "text-muted-foreground line-through",
                                                        )}
                                                    >
                                                        {t.title}
                                                    </span>
                                                    {t.kind === "watch" ? (
                                                        <span className="mt-1.5 flex items-center gap-2">
                                                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                                                <span
                                                                    className="block h-full rounded-full bg-sky-500"
                                                                    style={{
                                                                        width: `${goal ? (watched / goal) * 100 : 0}%`,
                                                                    }}
                                                                />
                                                            </span>
                                                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                                                {watched}/{goal} min
                                                            </span>
                                                        </span>
                                                    ) : (
                                                        <span className="block text-xs text-muted-foreground">
                                                            {t.done ? "Completed" : "Lesson"}
                                                        </span>
                                                    )}
                                                </span>
                                                {t.done ? (
                                                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                                                ) : (
                                                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                                                        Go <ChevronRight className="h-3.5 w-3.5" />
                                                    </span>
                                                )}
                                            </>
                                        );
                                        return (
                                            <li key={i}>
                                                {t.done ? (
                                                    <div className="flex items-center gap-3 px-4 py-3">
                                                        {body}
                                                    </div>
                                                ) : (
                                                    <Link
                                                        to={href}
                                                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 active:bg-muted"
                                                    >
                                                        {body}
                                                    </Link>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}

                            {mission?.rewarded_at && (
                                <div className="relative mt-4 flex items-center gap-3 rounded-2xl bg-gradient-lime px-4 py-3 text-sm text-primary-foreground shadow-glow">
                                    <Sparkles className="h-5 w-5 shrink-0" />
                                    <div>
                                        <div className="font-semibold">
                                            +50 XP &amp; +10 Gems earned
                                        </div>
                                        <div className="text-xs opacity-80">
                                            Streak extended. Come back tomorrow to keep it alive.
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Personal Growth ──────────────────────────────────────────── */}
                        {growth && (
                            <section>
                                <SectionTitle title="Yesterday vs Today" />
                                <div className="rounded-3xl border border-border bg-card p-4 shadow-card sm:p-5">
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <GrowthCell
                                            icon={PlayCircle}
                                            label="Lessons"
                                            unit="lessons"
                                            tint="bg-violet-500/15 text-violet-500"
                                            today={growth.today.lessons}
                                            yest={growth.yesterday.lessons}
                                        />
                                        <GrowthCell
                                            icon={Clock}
                                            label="Minutes"
                                            unit="min"
                                            tint="bg-sky-500/15 text-sky-500"
                                            today={growth.today.minutes}
                                            yest={growth.yesterday.minutes}
                                        />
                                    </div>
                                    <p className="mt-4 flex items-start gap-2 rounded-2xl bg-orange-500/10 px-3.5 py-3 text-xs text-muted-foreground">
                                        <Flame className="h-4 w-4 shrink-0 text-orange-500" />
                                        Streak grows when you complete today's mission — not by just
                                        opening the app.
                                    </p>
                                </div>
                            </section>
                        )}

                        {/* ── Mini Leaderboard ─────────────────────────────────────────── */}
                        <section>
                            <SectionTitle
                                title="Top players"
                                note="Ranked by gems → streak → XP"
                                to="/leaderboard"
                            />
                            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
                                {lbLoading ? (
                                    <div className="space-y-3 p-5">
                                        {Array.from({ length: 5 }).map((_, i) => (
                                            <div key={i} className="flex items-center gap-3">
                                                <Skeleton className="h-4 w-7 rounded" />
                                                <Skeleton className="h-9 w-9 rounded-full" />
                                                <Skeleton className="h-4 max-w-[50%] flex-1" />
                                                <Skeleton className="h-4 w-20" />
                                            </div>
                                        ))}
                                    </div>
                                ) : top10.length === 0 ? (
                                    <div className="p-8 text-center text-sm text-muted-foreground">
                                        No public profiles yet.{" "}
                                        <Link
                                            to="/settings"
                                            className="text-primary hover:underline"
                                        >
                                            Make yours public
                                        </Link>
                                    </div>
                                ) : (
                                    <>
                                        {podium.length > 0 && (
                                            <div className="border-b border-border">
                                                <Podium rows={podium} meId={user.id} />
                                            </div>
                                        )}
                                        <div className="divide-y divide-border">
                                            {listRows.map((r) => (
                                                <LbMiniRow
                                                    key={r.id}
                                                    r={r}
                                                    isMe={r.id === user.id}
                                                />
                                            ))}

                                            {/* User outside top 10 */}
                                            {myRow && myRow.rank > 10 && (
                                                <>
                                                    <div className="flex items-center gap-3 px-5 py-1.5">
                                                        <div className="flex-1 border-t border-dashed border-border" />
                                                        <span className="text-[10px] tracking-widest text-muted-foreground/60">
                                                            · · ·
                                                        </span>
                                                        <div className="flex-1 border-t border-dashed border-border" />
                                                    </div>
                                                    <LbMiniRow r={myRow} isMe />
                                                </>
                                            )}
                                        </div>
                                    </>
                                )}

                                <Link
                                    to="/leaderboard"
                                    className="flex items-center justify-center gap-1 border-t border-border py-3.5 text-sm font-semibold text-primary transition-colors hover:bg-muted/50"
                                >
                                    Full leaderboard <ArrowRight className="h-4 w-4" />
                                </Link>
                            </div>
                        </section>
                    </>
                )}
            </section>
        </AppShell>
    );
};

export default Growth;
