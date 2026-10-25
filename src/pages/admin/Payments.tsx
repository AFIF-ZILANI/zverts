import { useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import { RequireRole } from "@/components/RequireRole";
import { AdminShell } from "@/components/admin/AdminShell";
import {
    EmptyState,
    ErrorNote,
    FormDialog,
    Initial,
    Panel,
    Segmented,
} from "@/components/admin/parts";
import { timeAgo } from "@/components/admin/timeAgo";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Check, Copy, Loader2, Search, Wallet, X } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Status = "pending" | "approved" | "rejected";
const STATUSES: Status[] = ["pending", "approved", "rejected"];
type PaymentRow = Tables<"payments"> & {
    profile?: Pick<Tables<"profiles">, "id" | "email" | "name">;
};

const copy = (text: string, what: string) => {
    void navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
};

const AdminPaymentsInner = () => {
    const [status, setStatus] = useState<Status>("pending");
    const [search, setSearch] = useState("");
    const [rows, setRows] = useState<PaymentRow[]>([]);
    const [counts, setCounts] = useState<Record<Status, number | null>>({
        pending: null,
        approved: null,
        rejected: null,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [acting, setActing] = useState<string | null>(null);
    const [rejecting, setRejecting] = useState<PaymentRow | null>(null);

    const loadCounts = useCallback(async () => {
        const res = await Promise.all(
            STATUSES.map((s) =>
                supabase
                    .from("payments")
                    .select("id", { count: "exact", head: true })
                    .eq("status", s),
            ),
        );
        setCounts({ pending: res[0].count, approved: res[1].count, rejected: res[2].count });
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("payments")
            .select("*")
            .eq("status", status)
            .order("created_at", { ascending: status === "pending" })
            .limit(200);
        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }
        setError(null);
        let list: PaymentRow[] = data ?? [];
        if (list.length) {
            const ids = Array.from(new Set(list.map((r) => r.user_id)));
            const { data: profiles } = await supabase
                .from("profiles")
                .select("id,email,name")
                .in("id", ids);
            const map = new Map((profiles ?? []).map((p) => [p.id, p]));
            list = list.map((r) => ({ ...r, profile: map.get(r.user_id) }));
        }
        setRows(list);
        setLoading(false);
    }, [status]);

    useEffect(() => {
        void load();
    }, [load]);
    useEffect(() => {
        void loadCounts();
    }, [loadCounts]);

    // Realtime: new submissions, approvals and rejections refresh the list.
    useEffect(() => {
        const ch = supabase
            .channel("admin:payments-feed")
            .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
                void load();
                void loadCounts();
            })
            .subscribe();
        return () => {
            void supabase.removeChannel(ch);
        };
    }, [load, loadCounts]);

    // Search filters the loaded rows; typing doesn't refetch or resubscribe.
    const shown = useMemo(() => {
        const s = search.trim().toLowerCase();
        if (!s) return rows;
        return rows.filter(
            (r) =>
                r.trx_id?.toLowerCase().includes(s) ||
                r.profile?.email?.toLowerCase().includes(s) ||
                r.profile?.name?.toLowerCase().includes(s) ||
                r.sender_number?.includes(s),
        );
    }, [rows, search]);

    const approve = async (r: PaymentRow) => {
        setActing(r.id);
        const { error } = await supabase.rpc("approve_payment", { _payment_id: r.id });
        setActing(null);
        if (error) toast.error(error.message);
        else {
            toast.success(
                `Approved ${Number(r.amount).toLocaleString()} Tk for ${r.profile?.name || r.profile?.email || "learner"}`,
            );
            void load();
            void loadCounts();
        }
    };

    const reject = async (r: PaymentRow, note: string) => {
        setActing(r.id);
        const { error } = await supabase.rpc("reject_payment", {
            _payment_id: r.id,
            _note: note.trim() || undefined,
        });
        setActing(null);
        if (error) {
            toast.error(error.message);
            return false;
        }
        toast.success("Payment rejected");
        void load();
        void loadCounts();
    };

    return (
        <AdminShell
            title="Payments"
            description="Check the transaction in your bKash/Nagad app, then approve or reject."
        >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Segmented<Status>
                    value={status}
                    onChange={setStatus}
                    className="w-full sm:w-auto"
                    options={STATUSES.map((s) => ({
                        value: s,
                        label: (
                            <>
                                {s}
                                {counts[s] != null && (
                                    <span className="text-xs tabular-nums opacity-70">
                                        {counts[s]}
                                    </span>
                                )}
                            </>
                        ),
                    }))}
                />
                <div className="relative sm:w-72">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search name, email, trx, sender…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="rounded-full pl-9"
                    />
                </div>
            </div>

            {error && <ErrorNote>Couldn't load payments: {error}</ErrorNote>}

            <Panel>
                {loading ? (
                    <div className="space-y-3 p-4 sm:p-5">
                        {[0, 1, 2].map((i) => (
                            <Skeleton key={i} className="h-20 rounded-2xl" />
                        ))}
                    </div>
                ) : shown.length === 0 ? (
                    <EmptyState icon={Wallet}>
                        {rows.length
                            ? "No payments match your search."
                            : status === "pending"
                              ? "Nothing waiting. Every payment is handled."
                              : `No ${status} payments yet.`}
                    </EmptyState>
                ) : (
                    <ul className="divide-y divide-border/40">
                        {shown.map((r) => (
                            <li
                                key={r.id}
                                className="flex flex-col gap-3 p-4 sm:p-5 md:flex-row md:items-center"
                            >
                                <div className="flex min-w-0 flex-1 items-start gap-3">
                                    <Initial
                                        id={r.user_id}
                                        name={r.profile?.name}
                                        email={r.profile?.email}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                                            <span className="truncate font-medium">
                                                {r.profile?.name || "Unknown learner"}
                                            </span>
                                            <span className="font-display text-xl font-semibold tabular-nums md:hidden">
                                                {Number(r.amount).toLocaleString()} Tk
                                            </span>
                                        </div>
                                        <div className="truncate text-xs text-muted-foreground">
                                            {r.profile?.email}
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                                            <Chip>{r.credits} credits</Chip>
                                            <Chip className="capitalize">{r.method}</Chip>
                                            <Chip title={new Date(r.created_at).toLocaleString()}>
                                                {timeAgo(r.created_at)}
                                            </Chip>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
                                            <CopyValue label="Sender" value={r.sender_number} />
                                            <CopyValue label="TrxID" value={r.trx_id} />
                                        </div>
                                        {r.admin_note && (
                                            <div className="mt-2 text-xs text-destructive">
                                                Note: {r.admin_note}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 md:flex-col md:items-end">
                                    <span className="hidden font-display text-2xl font-semibold tabular-nums md:block">
                                        {Number(r.amount).toLocaleString()} Tk
                                    </span>
                                    {status === "pending" && (
                                        <div className="flex w-full gap-2 md:w-auto">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={acting === r.id}
                                                onClick={() => setRejecting(r)}
                                                className="flex-1 rounded-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive md:flex-none"
                                            >
                                                <X className="mr-1 h-4 w-4" /> Reject
                                            </Button>
                                            <Button
                                                size="sm"
                                                disabled={acting === r.id}
                                                onClick={() => void approve(r)}
                                                className="flex-1 rounded-full md:flex-none"
                                            >
                                                {acting === r.id ? (
                                                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Check className="mr-1 h-4 w-4" />
                                                )}
                                                Approve
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </Panel>

            <FormDialog
                open={!!rejecting}
                onOpenChange={(o) => !o && setRejecting(null)}
                title="Reject this payment?"
                description={
                    rejecting &&
                    `${Number(rejecting.amount).toLocaleString()} Tk from ${rejecting.profile?.name || rejecting.profile?.email || "this learner"}. They'll see your reason.`
                }
                fields={[
                    {
                        name: "note",
                        label: "Reason",
                        type: "textarea",
                        placeholder: "e.g. TrxID not found in bKash",
                    },
                ]}
                confirmLabel="Reject payment"
                destructive
                onSubmit={async (v) => (rejecting ? reject(rejecting, v.note ?? "") : undefined)}
            />
        </AdminShell>
    );
};

const Chip = ({
    children,
    className,
    title,
}: {
    children: ReactNode;
    className?: string;
    title?: string;
}) => (
    <span
        title={title}
        className={`rounded-full bg-muted/70 px-2 py-0.5 text-muted-foreground ${className ?? ""}`}
    >
        {children}
    </span>
);

const CopyValue = ({ label, value }: { label: string; value: string | null }) =>
    value ? (
        <button
            type="button"
            onClick={() => copy(value, label)}
            className="group inline-flex items-center gap-1 rounded text-left hover:text-primary"
            title={`Copy ${label}`}
        >
            <span className="text-muted-foreground">{label}</span>
            <span className="text-foreground group-hover:text-primary">{value}</span>
            <Copy className="h-3 w-3 opacity-50 group-hover:opacity-100" />
        </button>
    ) : null;

const AdminPayments = () => (
    <RequireRole role="admin">
        <AdminPaymentsInner />
    </RequireRole>
);
export default AdminPayments;
