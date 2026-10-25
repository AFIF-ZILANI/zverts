import { useEffect, useRef, useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { AdminShell } from "@/components/admin/AdminShell";
import { EmptyState, FormDialog, Initial, Panel } from "@/components/admin/parts";
import { timeAgo } from "@/components/admin/timeAgo";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Coins, Lock, LockOpen, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type UserRow = Database["public"]["Functions"]["admin_list_users"]["Returns"][number];
type Action = { kind: "credits" | "lock"; user: UserRow } | null;

const AdminUsersInner = () => {
    const [search, setSearch] = useState("");
    const [rows, setRows] = useState<UserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [action, setAction] = useState<Action>(null);
    // Only the newest search may set the rows; older responses can arrive later.
    const latest = useRef(0);
    const load = async () => {
        const req = ++latest.current;
        const { data, error } = await supabase.rpc("admin_list_users", {
            _limit: 200,
            _search: search.trim() || undefined,
        });
        if (req !== latest.current) return;
        if (error) toast.error(error.message);
        else setRows(data ?? []);
        setLoading(false);
    };
    useEffect(() => {
        // Wait for a pause in typing before searching.
        const t = setTimeout(load, search ? 300 : 0);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const adjust = async (u: UserRow, v: Record<string, string>) => {
        const delta = parseInt(v.delta ?? "", 10);
        if (isNaN(delta) || delta === 0) {
            toast.error("Enter a whole number, like 5 or -2");
            return false;
        }
        const { error } = await supabase.rpc("admin_adjust_credits", {
            _target: u.id,
            _delta: delta,
            _reason: v.reason?.trim() ?? "",
        });
        if (error) {
            toast.error(error.message);
            return false;
        }
        toast.success(
            `${delta > 0 ? "Added" : "Removed"} ${Math.abs(delta)} credit${Math.abs(delta) === 1 ? "" : "s"}`,
        );
        void load();
    };

    const toggleLock = async (u: UserRow, v: Record<string, string>) => {
        const { error } = await supabase.rpc("admin_set_locked", {
            _target: u.id,
            _locked: !u.locked,
            _reason: v.reason?.trim() ?? "",
        });
        if (error) {
            toast.error(error.message);
            return false;
        }
        toast.success(u.locked ? "Account unlocked" : "Account locked");
        void load();
    };

    const searchBox = (
        <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-full pl-9"
            />
        </div>
    );

    const target = action?.user;
    const who = target?.name || target?.email || "this learner";

    return (
        <AdminShell
            title="Users"
            description="Give or take credits, and lock accounts that break the rules."
        >
            {searchBox}

            <Panel
                title={
                    loading
                        ? "Users"
                        : `${rows.length}${rows.length === 200 ? "+" : ""} user${rows.length === 1 ? "" : "s"}`
                }
                note={
                    rows.length === 200
                        ? "Showing the first 200 — search to narrow down"
                        : undefined
                }
            >
                {loading ? (
                    <div className="space-y-3 p-4 sm:p-5">
                        {[0, 1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-14 rounded-2xl" />
                        ))}
                    </div>
                ) : rows.length === 0 ? (
                    <EmptyState icon={Users}>
                        {search.trim() ? "No users match your search." : "No users yet."}
                    </EmptyState>
                ) : (
                    <>
                        {/* Laptops and up: a table. */}
                        <div className="hidden overflow-x-auto lg:block">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border/60 text-left text-xs font-medium text-muted-foreground">
                                        <th className="px-5 py-2.5 font-medium">Learner</th>
                                        <th className="px-3 py-2.5 font-medium">Plan</th>
                                        <th className="px-3 py-2.5 text-right font-medium">
                                            Free left
                                        </th>
                                        <th className="px-3 py-2.5 text-right font-medium">
                                            Credits
                                        </th>
                                        <th className="px-3 py-2.5 text-right font-medium">Paid</th>
                                        <th className="px-3 py-2.5 font-medium">Last active</th>
                                        <th className="px-5 py-2.5 text-right font-medium">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/40">
                                    {rows.map((u) => (
                                        <tr key={u.id} className="hover:bg-foreground/[0.02]">
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-3">
                                                    <Initial
                                                        id={u.id}
                                                        name={u.name}
                                                        email={u.email}
                                                        className="h-8 w-8 text-xs"
                                                    />
                                                    <div className="min-w-0">
                                                        <div className="max-w-[220px] truncate font-medium">
                                                            {u.name || "—"}
                                                        </div>
                                                        <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                                                            {u.email}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="flex flex-wrap gap-1">
                                                    <PlanBadge paid={u.is_paid_user} />
                                                    {u.locked && <LockedBadge />}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-right tabular-nums">
                                                {u.playlist_conversions_left}
                                            </td>
                                            <td className="px-3 py-3 text-right font-semibold tabular-nums text-primary">
                                                {u.convert_credits}
                                            </td>
                                            <td className="px-3 py-3 text-right tabular-nums">
                                                {Number(u.total_paid).toLocaleString()} Tk
                                            </td>
                                            <td className="px-3 py-3 text-xs text-muted-foreground">
                                                {timeAgo(u.last_active)}
                                            </td>
                                            <td className="px-5 py-3">
                                                <RowActions
                                                    u={u}
                                                    onCredits={() =>
                                                        setAction({ kind: "credits", user: u })
                                                    }
                                                    onLock={() =>
                                                        setAction({ kind: "lock", user: u })
                                                    }
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Phones and small tablets: cards. */}
                        <ul className="divide-y divide-border/40 lg:hidden">
                            {rows.map((u) => (
                                <li key={u.id} className="p-4">
                                    <div className="flex items-center gap-3">
                                        <Initial id={u.id} name={u.name} email={u.email} />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate font-medium">
                                                {u.name || "—"}
                                            </div>
                                            <div className="truncate text-xs text-muted-foreground">
                                                {u.email}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <PlanBadge paid={u.is_paid_user} />
                                            {u.locked && <LockedBadge />}
                                        </div>
                                    </div>
                                    <dl className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-muted/50 p-2.5 text-center">
                                        <MiniStat
                                            label="Free left"
                                            value={u.playlist_conversions_left}
                                        />
                                        <MiniStat
                                            label="Credits"
                                            value={u.convert_credits}
                                            accent
                                        />
                                        <MiniStat
                                            label="Paid"
                                            value={`${Number(u.total_paid).toLocaleString()} Tk`}
                                        />
                                    </dl>
                                    <div className="mt-3 flex items-center justify-between gap-2">
                                        <span className="text-xs text-muted-foreground">
                                            Active {timeAgo(u.last_active).toLowerCase()}
                                        </span>
                                        <RowActions
                                            u={u}
                                            onCredits={() =>
                                                setAction({ kind: "credits", user: u })
                                            }
                                            onLock={() => setAction({ kind: "lock", user: u })}
                                        />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </Panel>

            <FormDialog
                open={action?.kind === "credits"}
                onOpenChange={(o) => !o && setAction(null)}
                title="Adjust credits"
                description={
                    target &&
                    `${who} has ${target.convert_credits} credit${target.convert_credits === 1 ? "" : "s"}. Use a minus to take credits away.`
                }
                fields={[
                    {
                        name: "delta",
                        label: "Change",
                        type: "number",
                        placeholder: "e.g. 5 or -2",
                        required: true,
                    },
                    {
                        name: "reason",
                        label: "Reason",
                        placeholder: "e.g. Refund for failed import",
                    },
                ]}
                confirmLabel="Save"
                onSubmit={async (v) => (target ? adjust(target, v) : undefined)}
            />
            <FormDialog
                open={action?.kind === "lock"}
                onOpenChange={(o) => !o && setAction(null)}
                title={target?.locked ? "Unlock this account?" : "Lock this account?"}
                description={
                    target?.locked
                        ? `${who} will be able to use ZverTs again.`
                        : `${who}'s account stays locked until an admin unlocks it.`
                }
                fields={[{ name: "reason", label: "Reason", type: "textarea" }]}
                confirmLabel={target?.locked ? "Unlock" : "Lock account"}
                destructive={!target?.locked}
                onSubmit={async (v) => (target ? toggleLock(target, v) : undefined)}
            />
        </AdminShell>
    );
};

const RowActions = ({
    u,
    onCredits,
    onLock,
}: {
    u: UserRow;
    onCredits: () => void;
    onLock: () => void;
}) => (
    <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={onCredits}>
            <Coins className="mr-1 h-3.5 w-3.5" /> Credits
        </Button>
        <Button
            size="sm"
            variant="outline"
            onClick={onLock}
            className={cn(
                "h-8 rounded-full",
                !u.locked &&
                    "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive",
            )}
        >
            {u.locked ? (
                <LockOpen className="mr-1 h-3.5 w-3.5" />
            ) : (
                <Lock className="mr-1 h-3.5 w-3.5" />
            )}
            {u.locked ? "Unlock" : "Lock"}
        </Button>
    </div>
);

const PlanBadge = ({ paid }: { paid: boolean }) => (
    <span
        className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium",
            paid ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
    >
        {paid ? "Paid" : "Free"}
    </span>
);

const LockedBadge = () => (
    <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
        Locked
    </span>
);

const MiniStat = ({
    label,
    value,
    accent,
}: {
    label: string;
    value: string | number;
    accent?: boolean;
}) => (
    <div>
        <dt className="text-[11px] text-muted-foreground">{label}</dt>
        <dd className={cn("text-sm font-semibold tabular-nums", accent && "text-primary")}>
            {value}
        </dd>
    </div>
);

const AdminUsers = () => (
    <RequireRole role="admin">
        <AdminUsersInner />
    </RequireRole>
);
export default AdminUsers;
