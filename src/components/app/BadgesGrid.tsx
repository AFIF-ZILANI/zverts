import { type ElementType, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
    BrainCircuit,
    Crown,
    Flame,
    Footprints,
    Gem,
    GraduationCap,
    Lock,
    Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Stat = "modules" | "courses" | "streak" | "gems";
type Stats = Record<Stat, number>;

// Mirrors public.evaluate_achievements(): each badge unlocks when `stat` reaches `goal`.
const BADGES: Record<
    string,
    { name: string; desc: string; icon: ElementType; color: string; stat: Stat; goal: number }
> = {
    first_module: {
        name: "First Steps",
        desc: "Completed your first module",
        icon: Footprints,
        color: "from-emerald-500 to-emerald-600",
        stat: "modules",
        goal: 1,
    },
    modules_10: {
        name: "Getting Serious",
        desc: "10 modules completed",
        icon: Rocket,
        color: "from-cyan-500 to-blue-600",
        stat: "modules",
        goal: 10,
    },
    modules_50: {
        name: "Knowledge Seeker",
        desc: "50 modules completed",
        icon: BrainCircuit,
        color: "from-violet-500 to-purple-600",
        stat: "modules",
        goal: 50,
    },
    first_course: {
        name: "Course Conqueror",
        desc: "Finished a full course",
        icon: GraduationCap,
        color: "from-amber-500 to-orange-600",
        stat: "courses",
        goal: 1,
    },
    streak_7: {
        name: "On Fire",
        desc: "7-day learning streak",
        icon: Flame,
        color: "from-orange-500 to-red-600",
        stat: "streak",
        goal: 7,
    },
    streak_30: {
        name: "Unstoppable",
        desc: "30-day streak",
        icon: Crown,
        color: "from-yellow-400 to-amber-600",
        stat: "streak",
        goal: 30,
    },
    gems_100: {
        name: "Gem Collector",
        desc: "Earned 100 gems",
        icon: Gem,
        color: "from-teal-400 to-emerald-600",
        stat: "gems",
        goal: 100,
    },
};

export const BadgesGrid = ({ userId }: { userId: string }) => {
    const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [rpcError, setRpcError] = useState<string | null>(null);
    // Codes seen so far; null until the first load, so old badges don't toast.
    const known = useRef<Set<string> | null>(null);

    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const load = async () => {
            // The database also checks on every completion and streak change;
            // this call catches anything earned before that and returns progress.
            const { data: check, error: checkErr } = await supabase.rpc("check_achievements");
            if (checkErr) console.error("[BadgesGrid] check_achievements failed:", checkErr);
            const { data, error: fetchErr } = await supabase
                .from("achievements")
                .select("code")
                .eq("user_id", userId);
            if (fetchErr) console.error("[BadgesGrid] achievements fetch failed:", fetchErr);
            if (cancelled) return;

            setRpcError(checkErr?.message ?? null);
            const s = (check as { stats?: Stats } | null)?.stats;
            if (s) setStats(s);
            const codes = new Set(
                (data ?? []).map((r: { code: string }) => r.code).filter((c) => c in BADGES),
            );
            if (known.current) {
                for (const c of codes) {
                    if (!known.current.has(c)) {
                        toast.success(`Badge unlocked: ${BADGES[c].name}`, {
                            description: BADGES[c].desc,
                        });
                    }
                }
            }
            known.current = codes;
            setUnlocked(codes);
            setLoading(false);
        };
        // Progress events arrive in bursts while a video plays; check once they settle.
        const reload = () => {
            clearTimeout(timer);
            timer = setTimeout(() => void load(), 800);
        };

        void load();
        const channel = supabase
            .channel(`badges:${userId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "achievements",
                    filter: `user_id=eq.${userId}`,
                },
                reload,
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "module_progress",
                    filter: `user_id=eq.${userId}`,
                },
                reload,
            )
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "user_progress",
                    filter: `user_id=eq.${userId}`,
                },
                reload,
            )
            .subscribe();
        return () => {
            cancelled = true;
            clearTimeout(timer);
            void supabase.removeChannel(channel);
        };
    }, [userId]);

    const total = Object.keys(BADGES).length;

    return (
        <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Badges</h2>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                    {loading ? "…" : `${unlocked.size} of ${total}`}
                </span>
            </div>

            {rpcError && (
                <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    Achievement check failed: {rpcError}
                </div>
            )}

            <div className="mt-4 grid grid-cols-4 gap-x-2 gap-y-4">
                {Object.entries(BADGES).map(([code, b]) => {
                    const Got = unlocked.has(code);
                    const Icon = b.icon;
                    return (
                        <div
                            key={code}
                            title={`${b.name} — ${b.desc}`}
                            aria-label={`${b.name}: ${Got ? "unlocked" : "locked"}. ${b.desc}`}
                            className={cn(
                                "flex flex-col items-center gap-1.5 text-center",
                                loading && "opacity-40",
                            )}
                        >
                            {/* Medal: gradient disc, glossy highlight, white glyph. */}
                            <span
                                className={cn(
                                    "relative flex h-12 w-12 items-center justify-center rounded-full transition-transform",
                                    Got
                                        ? `bg-gradient-to-br ${b.color} text-white shadow-[0_6px_16px_-6px_rgba(0,0,0,0.5)] ring-2 ring-white/20 ring-offset-2 ring-offset-card hover:scale-105`
                                        : "bg-muted text-muted-foreground/40 ring-1 ring-border",
                                )}
                            >
                                {Got && (
                                    <span className="pointer-events-none absolute inset-x-1.5 top-1 h-1/2 rounded-full bg-gradient-to-b from-white/45 to-transparent" />
                                )}
                                <Icon
                                    className={cn(
                                        "relative h-[22px] w-[22px]",
                                        Got && "drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]",
                                    )}
                                    strokeWidth={2.25}
                                />
                                {!Got && (
                                    <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-muted-foreground/70 text-card">
                                        <Lock className="h-2.5 w-2.5" strokeWidth={3} />
                                    </span>
                                )}
                            </span>
                            <span
                                className={cn(
                                    "line-clamp-2 text-[10px] leading-tight",
                                    Got ? "font-medium" : "text-muted-foreground",
                                )}
                            >
                                {b.name}
                            </span>
                            {!Got && stats && b.goal > 1 && (
                                <span className="w-10">
                                    <span className="block h-1 overflow-hidden rounded-full bg-muted">
                                        <span
                                            className="block h-full rounded-full bg-primary/70"
                                            style={{
                                                width: `${Math.min(100, (stats[b.stat] / b.goal) * 100)}%`,
                                            }}
                                        />
                                    </span>
                                    <span className="mt-0.5 block text-[9px] tabular-nums text-muted-foreground">
                                        {Math.min(stats[b.stat], b.goal)}/{b.goal}
                                    </span>
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
