import { useEffect, useRef, useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type UserRow = Database["public"]["Functions"]["admin_list_users"]["Returns"][number];

const AdminUsersInner = () => {
    const [search, setSearch] = useState("");
    const [rows, setRows] = useState<UserRow[]>([]);
    const [loading, setLoading] = useState(true);
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

    const adjust = async (id: string) => {
        const v = prompt("Credit delta (+/-):");
        if (!v) return;
        const delta = parseInt(v, 10);
        if (isNaN(delta)) {
            toast.error("Invalid number");
            return;
        }
        const reason = prompt("Reason:");
        if (reason === null) return;
        const { error } = await supabase.rpc("admin_adjust_credits", {
            _target: id,
            _delta: delta,
            _reason: reason,
        });
        if (error) toast.error(error.message);
        else {
            toast.success("Adjusted");
            load();
        }
    };
    const toggleLock = async (id: string, locked: boolean) => {
        const reason = prompt(locked ? "Reason for unlock:" : "Reason for lock:");
        // Cancel leaves the account as it is.
        if (reason === null) return;
        const { error } = await supabase.rpc("admin_set_locked", {
            _target: id,
            _locked: !locked,
            _reason: reason,
        });
        if (error) toast.error(error.message);
        else {
            toast.success(locked ? "Unlocked" : "Locked");
            load();
        }
    };

    return (
        <AppShell>
            <section className="container py-10 max-w-6xl">
                <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    / admin · users
                </div>
                <h1 className="font-display text-4xl font-semibold mt-2">Users</h1>
                <Input
                    placeholder="Search by name or email…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="mt-4 max-w-md"
                />
                <div className="mt-6 rounded-2xl border border-border bg-card overflow-x-auto">
                    <table className="w-full text-sm min-w-[800px]">
                        <thead>
                            <tr className="text-left text-xs font-mono uppercase text-muted-foreground border-b border-border">
                                <th className="p-3">Name</th>
                                <th>Email</th>
                                <th>Paid</th>
                                <th>Free left</th>
                                <th>Credits</th>
                                <th>Total Tk</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {!loading && rows.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={8}
                                        className="p-8 text-center text-sm text-muted-foreground font-mono"
                                    >
                                        {search.trim() ? "No users match your search." : "No users yet."}
                                    </td>
                                </tr>
                            )}
                            {rows.map((u) => (
                                <tr key={u.id} className="border-b border-border/40">
                                    <td className="p-3">{u.name}</td>
                                    <td className="text-muted-foreground">{u.email}</td>
                                    <td>{u.is_paid_user ? "✓" : "—"}</td>
                                    <td>{u.playlist_conversions_left}</td>
                                    <td className="text-primary font-medium">
                                        {u.convert_credits}
                                    </td>
                                    <td>{u.total_paid}</td>
                                    <td
                                        className={
                                            u.locked ? "text-destructive" : "text-muted-foreground"
                                        }
                                    >
                                        {u.locked ? "locked" : "active"}
                                    </td>
                                    <td className="text-right pr-3">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => adjust(u.id)}
                                        >
                                            ± Credits
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => toggleLock(u.id, u.locked)}
                                        >
                                            {u.locked ? "Unlock" : "Lock"}
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </AppShell>
    );
};
const AdminUsers = () => (
    <RequireRole role="admin">
        <AdminUsersInner />
    </RequireRole>
);
export default AdminUsers;
