// Learning Map: a GitHub-style contribution grid for one month at a time.
// Each square is a day (Bangladesh time); its shade is how many modules were
// finished that day. Columns are weeks, rows are weekdays.
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const DHAKA_OFFSET_MS = 6 * 3_600_000;
const dhakaKey = (ms: number) => new Date(ms + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
const MONTHS_BACK = 11;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SHADES = ["bg-muted", "bg-primary/30", "bg-primary/55", "bg-primary/80", "bg-primary"];
const shade = (n: number) => SHADES[Math.min(n, SHADES.length - 1)];

export const LearningMap = ({ completedAt }: { completedAt: string[] }) => {
    const counts = useMemo(() => {
        const m = new Map<string, number>();
        for (const ts of completedAt) {
            const k = dhakaKey(Date.parse(ts));
            m.set(k, (m.get(k) ?? 0) + 1);
        }
        return m;
    }, [completedAt]);

    const todayKey = dhakaKey(Date.now());
    const [nowY, nowM] = todayKey.split("-").map(Number);
    // Months back from the current one: 0 = this month.
    const [back, setBack] = useState(0);
    const first = new Date(Date.UTC(nowY, nowM - 1 - back, 1));
    const y = first.getUTCFullYear();
    const m = first.getUTCMonth();
    const daysIn = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const lead = first.getUTCDay();
    const weeks = Math.ceil((lead + daysIn) / 7);

    const days = Array.from({ length: daysIn }, (_, i) => {
        const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
        return { key, day: i + 1, n: counts.get(key) ?? 0, future: key > todayKey };
    });
    const total = days.reduce((s, d) => s + d.n, 0);
    const active = days.filter((d) => d.n > 0).length;
    const monthName = first.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
    const shortMonth = first.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

    return (
        <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-base font-semibold">Learning map</h2>
                    <p className="text-xs text-muted-foreground">
                        {total} module{total !== 1 ? "s" : ""} in {monthName}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                    <button
                        type="button"
                        aria-label="Previous month"
                        disabled={back >= MONTHS_BACK}
                        onClick={() => setBack((b) => b + 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="w-[72px] text-center text-sm font-medium tabular-nums">
                        {shortMonth} {y}
                    </span>
                    <button
                        type="button"
                        aria-label="Next month"
                        disabled={back === 0}
                        onClick={() => setBack((b) => b - 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            </div>

            <div className="mx-auto mt-4 flex max-w-[232px] gap-2 sm:max-w-[264px]">
                <div className="grid grid-rows-7 gap-1 text-[9px] text-muted-foreground sm:gap-1.5 sm:text-[10px]">
                    {WEEKDAYS.map((d, i) => (
                        <span key={i} className="flex items-center leading-none">
                            {d}
                        </span>
                    ))}
                </div>
                <div
                    className="grid flex-1 grid-flow-col grid-rows-7 gap-1 sm:gap-1.5"
                    style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
                >
                    {Array.from({ length: lead }, (_, i) => (
                        <span key={`pad${i}`} />
                    ))}
                    {days.map((d) => (
                        <span
                            key={d.key}
                            title={
                                d.future
                                    ? undefined
                                    : `${d.n || "No"} module${d.n !== 1 ? "s" : ""} on ${d.day} ${shortMonth}`
                            }
                            className={cn(
                                "aspect-square rounded-[5px] transition-colors",
                                d.future ? "bg-muted/40" : shade(d.n),
                                d.key === todayKey &&
                                    "ring-2 ring-foreground/60 ring-offset-1 ring-offset-card",
                            )}
                        />
                    ))}
                </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                <span>
                    {active} active day{active !== 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1">
                    Less
                    {SHADES.map((c) => (
                        <span key={c} className={cn("h-3 w-3 rounded-[3px]", c)} />
                    ))}
                    More
                </span>
            </div>
        </div>
    );
};
