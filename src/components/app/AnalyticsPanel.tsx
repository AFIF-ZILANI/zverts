import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingDown, Clock, Activity } from "lucide-react";

export const AnalyticsPanel = ({ userId }: { userId: string }) => {
    const [stats, setStats] = useState<{
        avgWatch: number;
        weakest: { title: string; pct: number }[];
    } | null>(null);

    useEffect(() => {
        (async () => {
            const { data: prog } = await supabase
                .from("module_progress")
                .select("watch_time_seconds, percent_watched, completed, modules!inner(title)")
                .eq("user_id", userId);
            const p = prog ?? [];
            const avgWatch = p.length
                ? Math.round(
                      p.reduce(
                          (s: number, r: { watch_time_seconds: number }) =>
                              s + r.watch_time_seconds,
                          0,
                      ) /
                          p.length /
                          60,
                  )
                : 0;
            const weakest = (
                p as {
                    completed: boolean;
                    percent_watched: number;
                    modules?: { title: string } | null;
                }[]
            )
                .filter((r) => !r.completed && r.percent_watched > 0 && r.percent_watched < 60)
                .sort((a, b) => a.percent_watched - b.percent_watched)
                .slice(0, 3)
                .map((r) => ({
                    title: r.modules?.title ?? "Module",
                    pct: Math.round(Number(r.percent_watched)),
                }));
            setStats({ avgWatch, weakest });
        })();
    }, [userId]);

    if (!stats) return null;

    return (
        <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
            <h2 className="text-base font-semibold">Learning insights</h2>
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-muted/50 p-3.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-500">
                    <Clock className="h-5 w-5" />
                </span>
                <div>
                    <div className="text-xs text-muted-foreground">Avg watch per module</div>
                    <div className="text-xl font-semibold tabular-nums">
                        {stats.avgWatch}
                        <span className="text-sm font-normal text-muted-foreground"> min</span>
                    </div>
                </div>
            </div>
            <div className="mt-4">
                <div className="mb-2.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <TrendingDown className="h-3.5 w-3.5" /> Needs another look
                </div>
                {stats.weakest.length === 0 ? (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Activity className="h-4 w-4 text-primary" /> No struggling modules — keep
                        going!
                    </p>
                ) : (
                    <div className="space-y-3">
                        {stats.weakest.map((w, i) => (
                            <div key={i}>
                                <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="truncate">{w.title}</span>
                                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                        {w.pct}%
                                    </span>
                                </div>
                                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                                    <div
                                        className="h-full rounded-full bg-amber-500"
                                        style={{ width: `${w.pct}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
