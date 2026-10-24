import { type ElementType, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Award, Flame, Trophy, BookOpen, Target, Gem, Brain, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

const BADGES: Record<string, { name: string; desc: string; icon: ElementType; color: string }> = {
    first_module: {
        name: "First Steps",
        desc: "Completed your first module",
        icon: BookOpen,
        color: "from-emerald-500 to-emerald-600",
    },
    modules_10: {
        name: "Getting Serious",
        desc: "10 modules completed",
        icon: Target,
        color: "from-cyan-500 to-blue-600",
    },
    modules_50: {
        name: "Knowledge Seeker",
        desc: "50 modules completed",
        icon: Brain,
        color: "from-violet-500 to-purple-600",
    },
    first_course: {
        name: "Course Conqueror",
        desc: "Finished a full course",
        icon: Trophy,
        color: "from-amber-500 to-orange-600",
    },
    streak_7: {
        name: "On Fire",
        desc: "7-day learning streak",
        icon: Flame,
        color: "from-orange-500 to-red-600",
    },
    streak_30: {
        name: "Unstoppable",
        desc: "30-day streak",
        icon: Crown,
        color: "from-yellow-400 to-amber-600",
    },
    gems_100: {
        name: "Gem Collector",
        desc: "Earned 100 gems",
        icon: Gem,
        color: "from-teal-400 to-emerald-600",
    },
};

export const BadgesGrid = ({ userId }: { userId: string }) => {
    const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [rpcError, setRpcError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            setLoading(true);
            setRpcError(null);

            const { error: checkErr } = await supabase.rpc("check_achievements");
            if (checkErr) {
                console.error("[BadgesGrid] check_achievements failed:", checkErr);
                setRpcError(checkErr.message);
            }

            const { data, error: fetchErr } = await supabase
                .from("achievements")
                .select("code")
                .eq("user_id", userId);
            if (fetchErr) {
                console.error("[BadgesGrid] achievements fetch failed:", fetchErr);
            }
            setUnlocked(new Set((data ?? []).map((r: { code: string }) => r.code)));
            setLoading(false);
        })();
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
                            className={cn(
                                "flex flex-col items-center gap-1.5 text-center",
                                loading && "opacity-40",
                            )}
                        >
                            <span
                                className={cn(
                                    "flex h-12 w-12 items-center justify-center rounded-2xl transition-transform",
                                    Got
                                        ? `bg-gradient-to-br ${b.color} text-white shadow-md hover:scale-105`
                                        : "border border-dashed border-border bg-muted/40 text-muted-foreground/50",
                                )}
                            >
                                <Icon className="h-5 w-5" />
                            </span>
                            <span
                                className={cn(
                                    "line-clamp-2 text-[10px] leading-tight",
                                    Got ? "font-medium" : "text-muted-foreground",
                                )}
                            >
                                {b.name}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
