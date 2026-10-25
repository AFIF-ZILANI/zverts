import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RequireRole } from "@/components/RequireRole";
import { AdminShell } from "@/components/admin/AdminShell";
import { EmptyState, Initial, Metric, Panel } from "@/components/admin/parts";
import { timeAgo } from "@/components/admin/timeAgo";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useEntitlements } from "@/hooks/useEntitlements";
import {
    AlertCircle,
    ArrowRight,
    Banknote,
    CheckCircle2,
    Flame,
    Gem,
    Inbox,
    Mail,
    UserCheck,
    Users,
    Wallet,
    XCircle,
    Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

const RECENT = 8;

// Declared outside the component so the row types can be inferred from the selects.
const recentMembersQuery = () =>
    supabase
        .from("profiles")
        .select("id,name,email,last_active,user_progress(total_gems,total_xp,current_streak)")
        .order("last_active", { ascending: false, nullsFirst: false })
        .limit(RECENT);
type Member = NonNullable<Awaited<ReturnType<typeof recentMembersQuery>>["data"]>[number];

const pendingQuery = () =>
    supabase
        .from("payments")
        .select("id,user_id,amount,credits,method,created_at", { count: "exact" })
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(5);
type Pending = NonNullable<Awaited<ReturnType<typeof pendingQuery>>["data"]>[number];

type Overview = {
    learners: number;
    active7d: number;
    revenue: number;
    approved: number;
    pendingCount: number;
    pending: (Pending & { who?: string })[];
    members: Member[];
    logs: Tables<"email_logs">[];
};

const taka = (n: number) => `${n.toLocaleString()} Tk`;

const OverviewInner = () => {
    const { isSuperAdmin } = useEntitlements();
    const [data, setData] = useState<Overview | null>(null);

    useEffect(() => {
        const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
        const load = async () => {
            const [learners, active, approved, pending, members, logs] = await Promise.all([
                supabase.from("profiles").select("id", { count: "exact", head: true }),
                supabase
                    .from("profiles")
                    .select("id", { count: "exact", head: true })
                    .gt("last_active", weekAgo),
                supabase.from("payments").select("amount").eq("status", "approved"),
                pendingQuery(),
                recentMembersQuery(),
                supabase
                    .from("email_logs")
                    .select("*")
                    .order("created_at", { ascending: false })
                    .limit(8),
            ]);
            // Name the people behind the waiting payments.
            const ids = (pending.data ?? []).map((p) => p.user_id);
            const { data: people } = ids.length
                ? await supabase.from("profiles").select("id,name,email").in("id", ids)
                : { data: [] };
            const who = new Map((people ?? []).map((p) => [p.id, p.name || p.email || "Unknown"]));
            setData({
                learners: learners.count ?? 0,
                active7d: active.count ?? 0,
                revenue: (approved.data ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0),
                approved: approved.data?.length ?? 0,
                pendingCount: pending.count ?? 0,
                pending: (pending.data ?? []).map((p) => ({ ...p, who: who.get(p.user_id) })),
                members: members.data ?? [],
                logs: logs.data ?? [],
            });
        };
        void load();
        // A new or handled payment changes the queue and the totals.
        const ch = supabase
            .channel("admin:overview")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "payments" },
                () => void load(),
            )
            .subscribe();
        return () => {
            void supabase.removeChannel(ch);
        };
    }, []);

    return (
        <AdminShell
            title="Overview"
            description={
                <>
                    What needs you today, and who's learning. Signed in as{" "}
                    <span className="font-medium text-foreground">
                        {isSuperAdmin ? "super admin" : "admin"}
                    </span>
                    .
                </>
            }
        >
            {!data ? (
                <OverviewSkeleton />
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Metric
                            icon={Users}
                            tint="bg-violet-500/15 text-violet-500"
                            label="Learners"
                            value={data.learners.toLocaleString()}
                            sub="All accounts"
                        />
                        <Metric
                            icon={UserCheck}
                            tint="bg-sky-500/15 text-sky-500"
                            label="Active this week"
                            value={data.active7d.toLocaleString()}
                            sub={`${data.learners ? Math.round((data.active7d / data.learners) * 100) : 0}% of learners`}
                        />
                        <Metric
                            icon={Wallet}
                            tint="bg-amber-500/15 text-amber-500"
                            label="Waiting payments"
                            value={
                                <span className={cn(data.pendingCount > 0 && "text-amber-500")}>
                                    {data.pendingCount}
                                </span>
                            }
                            sub={data.pendingCount ? "Need a decision" : "All handled"}
                        />
                        <Metric
                            icon={Banknote}
                            tint="bg-primary/15 text-primary"
                            label="Revenue"
                            value={taka(data.revenue)}
                            sub={`${data.approved} approved payments`}
                        />
                    </div>

                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-start">
                        <Panel
                            title="Recently active"
                            note="Learners who opened ZverTs most recently"
                            action={<SeeAll to="/admin/users" label="All users" />}
                        >
                            {data.members.length === 0 ? (
                                <EmptyState icon={Users}>No learners yet.</EmptyState>
                            ) : (
                                <ul className="divide-y divide-border/40">
                                    {data.members.map((m) => {
                                        const p = m.user_progress;
                                        return (
                                            <li
                                                key={m.id}
                                                className="flex items-center gap-3 px-4 py-3 sm:px-5"
                                            >
                                                <Initial id={m.id} name={m.name} email={m.email} />
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-sm font-medium">
                                                        {m.name || "—"}
                                                    </div>
                                                    <div className="truncate text-xs text-muted-foreground">
                                                        {m.email}
                                                    </div>
                                                </div>
                                                <div className="hidden items-center text-xs tabular-nums sm:flex">
                                                    <Stat
                                                        icon={Flame}
                                                        tint="text-orange-500"
                                                        v={p?.current_streak ?? 0}
                                                        label="Streak"
                                                    />
                                                    <Stat
                                                        icon={Gem}
                                                        tint="text-sky-500"
                                                        v={p?.total_gems ?? 0}
                                                        label="Gems"
                                                    />
                                                    <Stat
                                                        icon={Zap}
                                                        tint="text-yellow-500"
                                                        v={p?.total_xp ?? 0}
                                                        label="XP"
                                                    />
                                                </div>
                                                <span className="w-[76px] shrink-0 text-right text-xs text-muted-foreground">
                                                    {timeAgo(m.last_active)}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </Panel>

                        <div className="space-y-5">
                            <Panel
                                title="Waiting payments"
                                note={data.pendingCount ? "Oldest first" : undefined}
                                action={<SeeAll to="/admin/payments" label="Review" />}
                            >
                                {data.pending.length === 0 ? (
                                    <EmptyState icon={CheckCircle2}>
                                        Nothing waiting. Every payment is handled.
                                    </EmptyState>
                                ) : (
                                    <ul className="divide-y divide-border/40">
                                        {data.pending.map((p) => (
                                            <li key={p.id}>
                                                <Link
                                                    to="/admin/payments"
                                                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.03] sm:px-5"
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <div className="truncate text-sm font-medium">
                                                            {p.who ?? "Unknown"}
                                                        </div>
                                                        <div className="truncate text-xs text-muted-foreground">
                                                            {p.credits} credits · {p.method} ·{" "}
                                                            {timeAgo(p.created_at)}
                                                        </div>
                                                    </div>
                                                    <span className="text-sm font-semibold tabular-nums">
                                                        {taka(Number(p.amount))}
                                                    </span>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </Panel>

                            <Panel title="Sent emails" note="Latest system emails">
                                {data.logs.length === 0 ? (
                                    <EmptyState icon={Inbox}>No emails sent yet.</EmptyState>
                                ) : (
                                    <ul className="divide-y divide-border/40">
                                        {data.logs.map((l) => {
                                            const sent = l.status === "sent";
                                            const failed = l.status === "failed";
                                            const Icon = sent
                                                ? CheckCircle2
                                                : failed
                                                  ? XCircle
                                                  : AlertCircle;
                                            return (
                                                <li
                                                    key={l.id}
                                                    className="flex items-center gap-3 px-4 py-3 sm:px-5"
                                                >
                                                    <Icon
                                                        className={cn(
                                                            "h-4 w-4 shrink-0",
                                                            sent
                                                                ? "text-emerald-500"
                                                                : failed
                                                                  ? "text-destructive"
                                                                  : "text-amber-500",
                                                        )}
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="truncate text-sm">
                                                            {l.recipient_email}
                                                        </div>
                                                        <div className="truncate text-xs text-muted-foreground">
                                                            <Mail className="mr-1 inline h-3 w-3" />
                                                            {l.email_type}
                                                        </div>
                                                    </div>
                                                    <span className="shrink-0 text-xs text-muted-foreground">
                                                        {timeAgo(l.created_at)}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </Panel>
                        </div>
                    </div>
                </>
            )}
        </AdminShell>
    );
};

const SeeAll = ({ to, label }: { to: string; label: string }) => (
    <Link
        to={to}
        className="-mr-1 inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-sm font-medium text-primary hover:bg-primary/10"
    >
        {label} <ArrowRight className="h-3.5 w-3.5" />
    </Link>
);

const Stat = ({
    icon: Icon,
    tint,
    v,
    label,
}: {
    icon: typeof Flame;
    tint: string;
    v: number;
    label: string;
}) => (
    <span className="inline-flex w-16 items-center justify-end gap-1" title={label}>
        <Icon className={cn("h-3.5 w-3.5", tint)} />
        {v.toLocaleString()}
    </span>
);

const OverviewSkeleton = () => (
    <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[116px] rounded-3xl" />
            ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
            <Skeleton className="h-[460px] rounded-3xl" />
            <Skeleton className="h-[300px] rounded-3xl" />
        </div>
    </>
);

const Admin = () => (
    <RequireRole role="admin">
        <OverviewInner />
    </RequireRole>
);

export default Admin;
