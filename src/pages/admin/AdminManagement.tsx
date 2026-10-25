import { useEffect, useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { AdminShell } from "@/components/admin/AdminShell";
import { EmptyState, ErrorNote, Initial, Panel, Segmented } from "@/components/admin/parts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, ShieldCheck, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type AdminRow = Database["public"]["Functions"]["list_admin_users"]["Returns"][number];
type AppRole = Database["public"]["Enums"]["app_role"];
type Grantable = "admin" | "super_admin";

const ROLE_LABEL: Record<string, string> = { admin: "Admin", super_admin: "Super admin" };
const ROLE_NOTE: Record<Grantable, string> = {
    admin: "Payments, users, support contacts, broadcasts and Impact.",
    super_admin: "Everything an admin can do, plus giving and removing roles.",
};

const AdminManagementInner = () => {
    const { user } = useAuth();
    const [admins, setAdmins] = useState<AdminRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<Grantable>("admin");
    const [busy, setBusy] = useState(false);
    const [revoking, setRevoking] = useState<{ a: AdminRow; role: AppRole } | null>(null);

    const load = async () => {
        const { data, error } = await supabase.rpc("list_admin_users");
        if (error) setError(error.message);
        else setError(null);
        setAdmins(data ?? []);
    };
    useEffect(() => {
        void load();
    }, []);

    const grant = async () => {
        if (!email.trim()) return;
        setBusy(true);
        const { error } = await supabase.rpc("admin_set_role", {
            _email: email.trim(),
            _role: role,
            _grant: true,
        });
        setBusy(false);
        if (error) toast.error(error.message);
        else {
            toast.success(`${ROLE_LABEL[role]} role given to ${email.trim()}`);
            setEmail("");
            void load();
        }
    };

    const revoke = async () => {
        if (!revoking) return;
        setBusy(true);
        const { error } = await supabase.rpc("admin_set_role", {
            _email: revoking.a.email,
            _role: revoking.role,
            _grant: false,
        });
        setBusy(false);
        setRevoking(null);
        if (error) toast.error(error.message);
        else {
            toast.success("Role removed");
            void load();
        }
    };

    return (
        <AdminShell
            title="Admins"
            description="Who can open this panel. Only super admins can change it."
        >
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-start">
                <Panel
                    title="Team"
                    note={admins ? `${admins.length} people with admin access` : undefined}
                >
                    {error && (
                        <div className="p-4">
                            <ErrorNote>Couldn't load admins: {error}</ErrorNote>
                        </div>
                    )}
                    {!admins ? (
                        <div className="space-y-3 p-4 sm:p-5">
                            {[0, 1, 2].map((i) => (
                                <Skeleton key={i} className="h-14 rounded-2xl" />
                            ))}
                        </div>
                    ) : admins.length === 0 ? (
                        <EmptyState icon={ShieldCheck}>No admins yet.</EmptyState>
                    ) : (
                        <ul className="divide-y divide-border/40">
                            {admins.map((a) => {
                                const me = a.user_id === user?.id;
                                return (
                                    <li
                                        key={a.user_id}
                                        className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
                                    >
                                        <Initial id={a.user_id} name={a.name} email={a.email} />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate font-medium">
                                                {a.name || "—"}
                                                {me && (
                                                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                                        (you)
                                                    </span>
                                                )}
                                            </div>
                                            <div className="truncate text-xs text-muted-foreground">
                                                {a.email}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {(a.roles as AppRole[]).map((r) => (
                                                <button
                                                    key={r}
                                                    type="button"
                                                    onClick={() => setRevoking({ a, role: r })}
                                                    aria-label={`Remove ${ROLE_LABEL[r] ?? r} from ${a.email}`}
                                                    className={cn(
                                                        "group inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors",
                                                        r === "super_admin"
                                                            ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                                            : "border-primary/40 bg-primary/10 text-primary",
                                                        "hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive",
                                                    )}
                                                >
                                                    {ROLE_LABEL[r] ?? r}
                                                    <X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                                                </button>
                                            ))}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Panel>

                <Panel title="Give a role" note="The person must already have a ZverTs account.">
                    <form
                        className="space-y-4 p-4 sm:p-5"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void grant();
                        }}
                    >
                        <div className="space-y-1.5">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="name@gmail.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Role</Label>
                            <Segmented<Grantable>
                                value={role}
                                onChange={setRole}
                                className="flex w-full"
                                options={[
                                    { value: "admin", label: "Admin" },
                                    { value: "super_admin", label: "Super admin" },
                                ]}
                            />
                            <p className="text-xs text-muted-foreground">{ROLE_NOTE[role]}</p>
                        </div>
                        <Button
                            type="submit"
                            disabled={busy || !email.trim()}
                            className="w-full rounded-full"
                        >
                            {busy ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <UserPlus className="mr-2 h-4 w-4" />
                            )}
                            Give {ROLE_LABEL[role].toLowerCase()} role
                        </Button>
                    </form>
                </Panel>
            </div>

            <AlertDialog open={!!revoking} onOpenChange={(o) => !busy && !o && setRevoking(null)}>
                <AlertDialogContent className="w-[calc(100%-2rem)] rounded-3xl sm:max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Remove{" "}
                            {revoking && (ROLE_LABEL[revoking.role] ?? revoking.role).toLowerCase()}{" "}
                            role?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {revoking?.a.user_id === user?.id
                                ? "This is your own account. You may lose access to this page."
                                : `${revoking?.a.name || revoking?.a.email} loses this access straight away.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy}
                            onClick={(e) => {
                                e.preventDefault();
                                void revoke();
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Remove role
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AdminShell>
    );
};

const AdminManagement = () => (
    <RequireRole role="super_admin">
        <AdminManagementInner />
    </RequireRole>
);
export default AdminManagement;
