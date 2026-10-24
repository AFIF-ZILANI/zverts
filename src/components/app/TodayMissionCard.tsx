import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, Target, Trophy } from "lucide-react";
import { ProgressRing } from "@/components/app/ProgressRing";

type Mission = { total: number; done: number; rewarded_at: string | null };

export function TodayMissionCard({ userId }: { userId: string }) {
    const [m, setM] = useState<Mission | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data } = await (supabase.rpc as any)("get_today_mission");
            if (!cancelled && data) setM(data as Mission);
        };
        void load();
        const ch = supabase
            .channel(`mission-card:${userId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "module_progress",
                    filter: `user_id=eq.${userId}`,
                },
                () => void load(),
            )
            .subscribe();
        return () => {
            cancelled = true;
            void supabase.removeChannel(ch);
        };
    }, [userId]);

    const total = m?.total ?? 0;
    const done = m?.done ?? 0;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const complete = !!m?.rewarded_at;

    return (
        <Link
            to="/growth"
            className="group flex items-center gap-4 rounded-3xl border border-border bg-card p-4 shadow-card transition-colors hover:border-primary/40 active:scale-[0.99] sm:p-5"
        >
            <ProgressRing value={complete ? 100 : pct} size={68} stroke={7}>
                {complete ? (
                    <Trophy className="h-6 w-6 text-primary" />
                ) : (
                    <span className="text-base font-semibold tabular-nums">
                        {done}
                        <span className="text-muted-foreground">/{total}</span>
                    </span>
                )}
            </ProgressRing>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Target className="h-3.5 w-3.5 text-primary" /> Today's mission
                </div>
                <div className="mt-0.5 truncate text-base font-semibold">
                    {complete ? "Mission complete" : "Better than yesterday"}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                    {complete ? "+50 XP, +10 Gems earned today" : `${pct}% of today's tasks done`}
                </div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
    );
}
