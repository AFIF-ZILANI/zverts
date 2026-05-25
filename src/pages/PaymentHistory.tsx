import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/hooks/useEntitlements";

const STATUS_COLOR: Record<string, string> = {
  pending: "text-yellow-500 bg-yellow-500/10 border-yellow-500/30",
  approved: "text-primary bg-primary/10 border-primary/30",
  rejected: "text-destructive bg-destructive/10 border-destructive/30",
};

const PaymentHistory = () => {
  const { user, loading } = useAuth();
  const ent = useEntitlements();
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("payments" as any).select("*").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => setRows((data as any) ?? []));
  }, [user]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <AppShell>
      <section className="container py-10 md:py-14 max-w-4xl">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">/ payments</div>
            <h1 className="font-display text-4xl font-semibold tracking-tight mt-2">My payments</h1>
          </div>
          <Link to="/buy"><Button className="bg-gradient-lime text-primary-foreground shadow-glow">Buy a pack</Button></Link>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-6">
          <div className="rounded-xl border border-border bg-card p-4"><div className="text-xs font-mono text-muted-foreground uppercase">Free left</div><div className="font-display text-2xl mt-1">{ent.free_left} / 3</div></div>
          <div className="rounded-xl border border-border bg-card p-4"><div className="text-xs font-mono text-muted-foreground uppercase">Credits</div><div className="font-display text-2xl mt-1 text-primary">{ent.convert_credits}</div></div>
          <div className="rounded-xl border border-border bg-card p-4"><div className="text-xs font-mono text-muted-foreground uppercase">AI Tutor</div><div className="font-display text-2xl mt-1">{ent.ai_enabled ? "✨ Unlocked" : "Locked"}</div></div>
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-card overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground font-mono">No payments yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((r) => (
                <div key={r.id} className="p-4 flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-display text-lg">{r.package_type} · {r.credits} credits</div>
                    <div className="text-xs font-mono text-muted-foreground mt-0.5">{new Date(r.created_at).toLocaleString()} · {r.method} · {r.trx_id}</div>
                    {r.admin_note && <div className="text-xs text-destructive mt-1">Admin note: {r.admin_note}</div>}
                  </div>
                  <div className="font-display text-xl">{r.amount} Tk</div>
                  <div className={`px-3 py-1 rounded-full border text-xs font-mono uppercase tracking-wider ${STATUS_COLOR[r.status]}`}>{r.status}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
};
export default PaymentHistory;
