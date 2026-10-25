// Support → By course: every course's learners, how long each has been away,
// and their number for a direct call. Learners away 3+ days are flagged; the
// app sends them a reminder on days 3, 4 and 5 (send_inactivity_reminders).
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, ErrorNote, Initial, Panel, Segmented } from "@/components/admin/parts";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
    BellRing,
    ChevronDown,
    Copy,
    MessageCircle,
    PhoneCall,
    PhoneOff,
    Search,
    Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Row = Database["public"]["Functions"]["admin_learners_by_course"]["Returns"][number];
type Filter = "inactive" | "all";

/** Learners away this many days or more are flagged and get reminders. */
const INACTIVE_DAYS = 3;

// Some numbers were saved with the trunk 0 (+880 01…) or the country code
// typed again (+880 8801…); drop those so the number dials and opens WhatsApp.
const dialable = (cc: string | null, phone: string | null) => {
    if (!phone) return null;
    const code = cc ?? "";
    const ccDigits = code.replace(/\D/g, "");
    let n = phone.replace(/^\+/, "");
    if (ccDigits && n.length > 10 && n.startsWith(ccDigits)) n = n.slice(ccDigits.length);
    if (code) n = n.replace(/^0+/, "");
    return `${code}${n}`;
};

const awayLabel = (d: number | null) =>
    d == null
        ? "Never opened"
        : d === 0
          ? "Active today"
          : d === 1
            ? "Yesterday"
            : `${d} days away`;

const awayTone = (d: number | null) =>
    d == null || d >= 7
        ? "bg-destructive/15 text-destructive"
        : d >= INACTIVE_DAYS
          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          : "bg-primary/15 text-primary";

type Group = {
    key: string;
    title: string;
    thumb: string | null;
    learners: Row[];
    inactive: number;
};

export const LearnersByCourse = () => {
    const [rows, setRows] = useState<Row[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>("inactive");
    const [search, setSearch] = useState("");
    const [open, setOpen] = useState<Set<string>>(new Set());

    useEffect(() => {
        supabase.rpc("admin_learners_by_course").then(({ data, error }) => {
            if (error) setError(error.message);
            setRows(data ?? []);
        });
    }, []);

    const groups = useMemo(() => {
        const s = search.trim().toLowerCase();
        const map = new Map<string, Group>();
        for (const r of rows ?? []) {
            const away = r.inactive_days == null || r.inactive_days >= INACTIVE_DAYS;
            if (filter === "inactive" && !away) continue;
            if (
                s &&
                !r.course_title.toLowerCase().includes(s) &&
                !r.name?.toLowerCase().includes(s) &&
                !r.email?.toLowerCase().includes(s)
            )
                continue;
            const g = map.get(r.course_key) ?? {
                key: r.course_key,
                title: r.course_title,
                thumb: r.thumbnail_url,
                learners: [],
                inactive: 0,
            };
            g.learners.push(r);
            if (away) g.inactive++;
            map.set(r.course_key, g);
        }
        // Longest-away learners first; courses with the most of them first.
        for (const g of map.values())
            g.learners.sort((a, b) => (b.inactive_days ?? 9999) - (a.inactive_days ?? 9999));
        return [...map.values()].sort(
            (a, b) => b.inactive - a.inactive || b.learners.length - a.learners.length,
        );
    }, [rows, filter, search]);

    const toggle = (key: string) =>
        setOpen((o) => {
            const n = new Set(o);
            if (n.has(key)) n.delete(key);
            else n.add(key);
            return n;
        });

    const total = groups.reduce((s, g) => s + g.learners.length, 0);

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Segmented<Filter>
                    value={filter}
                    onChange={setFilter}
                    className="w-full sm:w-auto"
                    options={[
                        { value: "inactive", label: `Away ${INACTIVE_DAYS}+ days` },
                        { value: "all", label: "All learners" },
                    ]}
                />
                <div className="relative sm:w-72">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search course or learner…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="rounded-full pl-9"
                    />
                </div>
            </div>

            <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <BellRing className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                Learners away {INACTIVE_DAYS} days get a reminder at 7:30 PM that day and the next
                two days, unless they turned comeback reminders off.
            </p>

            {error && <ErrorNote>Couldn't load learners: {error}</ErrorNote>}

            {!rows ? (
                <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                        <Skeleton key={i} className="h-20 rounded-3xl" />
                    ))}
                </div>
            ) : groups.length === 0 ? (
                <Panel>
                    <EmptyState icon={Users}>
                        {search.trim()
                            ? "No course or learner matches your search."
                            : filter === "inactive"
                              ? `Everyone opened ZverTs in the last ${INACTIVE_DAYS} days.`
                              : "No courses yet."}
                    </EmptyState>
                </Panel>
            ) : (
                <>
                    <div className="px-1 text-sm text-muted-foreground">
                        {total} learner{total === 1 ? "" : "s"} in {groups.length} course
                        {groups.length === 1 ? "" : "s"}
                    </div>
                    {groups.map((g) => {
                        const isOpen = open.has(g.key) || groups.length === 1;
                        return (
                            <Panel key={g.key}>
                                <button
                                    type="button"
                                    onClick={() => toggle(g.key)}
                                    aria-expanded={isOpen}
                                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-foreground/[0.02] sm:px-5"
                                >
                                    <div className="aspect-video w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                                        {g.thumb && (
                                            <img
                                                src={g.thumb}
                                                alt=""
                                                loading="lazy"
                                                onError={(e) =>
                                                    (e.currentTarget.style.display = "none")
                                                }
                                                className="h-full w-full object-cover"
                                            />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate font-medium">{g.title}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {g.learners.length} learner
                                            {g.learners.length === 1 ? "" : "s"}
                                            {g.inactive > 0 && (
                                                <span className="text-amber-600 dark:text-amber-400">
                                                    {" "}
                                                    · {g.inactive} away {INACTIVE_DAYS}+ days
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <ChevronDown
                                        className={cn(
                                            "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                                            isOpen && "rotate-180",
                                        )}
                                    />
                                </button>
                                {isOpen && (
                                    <ul className="divide-y divide-border/40 border-t border-border/60">
                                        {g.learners.map((r) => (
                                            <LearnerRow key={`${g.key}:${r.user_id}`} r={r} />
                                        ))}
                                    </ul>
                                )}
                            </Panel>
                        );
                    })}
                </>
            )}
        </div>
    );
};

const LearnerRow = ({ r }: { r: Row }) => {
    const phone = dialable(r.country_code, r.phone_number);
    const digits = phone?.replace(/\D/g, "");
    const pct = r.videos_total ? Math.round((r.videos_done / r.videos_total) * 100) : 0;
    return (
        <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <Initial id={r.user_id} name={r.name} email={r.email} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.name || "—"}</div>
                    <div className="truncate text-xs text-muted-foreground">{r.email}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span
                            className={cn(
                                "rounded-full px-2 py-0.5 font-medium",
                                awayTone(r.inactive_days),
                            )}
                        >
                            {awayLabel(r.inactive_days)}
                        </span>
                        <span className="rounded-full bg-muted/70 px-2 py-0.5 text-muted-foreground tabular-nums">
                            {r.videos_done}/{r.videos_total} videos · {pct}%
                        </span>
                        {r.reminders_sent > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5 text-muted-foreground">
                                <BellRing className="h-3 w-3" /> {r.reminders_sent} reminder
                                {r.reminders_sent === 1 ? "" : "s"} sent
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {phone ? (
                <div className="flex items-center gap-1.5 pl-12 sm:pl-0">
                    <span className="mr-1 font-mono text-xs text-muted-foreground">{phone}</span>
                    <a
                        href={`tel:${phone}`}
                        aria-label={`Call ${r.name}`}
                        className={cn(
                            "flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium",
                            r.inactive_days == null || r.inactive_days >= INACTIVE_DAYS
                                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                : "border border-border hover:bg-foreground/5",
                        )}
                    >
                        <PhoneCall className="h-4 w-4" /> Call
                    </a>
                    {r.whatsapp_enabled && (
                        <a
                            href={`https://wa.me/${digits}`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`WhatsApp ${r.name}`}
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/40 text-primary hover:bg-primary/10"
                        >
                            <MessageCircle className="h-4 w-4" />
                        </a>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            void navigator.clipboard.writeText(phone);
                            toast.success("Number copied");
                        }}
                        aria-label={`Copy ${r.name}'s number`}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:bg-foreground/5"
                    >
                        <Copy className="h-4 w-4" />
                    </button>
                </div>
            ) : (
                <span className="inline-flex items-center gap-1.5 pl-12 text-xs text-muted-foreground sm:pl-0">
                    <PhoneOff className="h-3.5 w-3.5" /> No number shared
                </span>
            )}
        </li>
    );
};
