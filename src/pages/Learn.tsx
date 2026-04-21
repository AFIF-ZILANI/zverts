import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { AppShell } from "@/components/zerod/AppShell";
import { ModuleCard } from "@/components/zerod/ModuleCard";
import { supabase } from "@/integrations/supabase/client";

interface ModuleRow { id: string; position: number; title: string; duration_seconds: number; }
interface ProgressRow { module_id: string; percent_watched: number; completed: boolean; }

const Learn = () => {
  const { user, loading: authLoading } = useAuth();
  const [mods, setMods] = useState<ModuleRow[]>([]);
  const [prog, setProg] = useState<ProgressRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: m }, { data: p }] = await Promise.all([
        supabase.from("modules").select("id,position,title,duration_seconds").order("position"),
        supabase.from("module_progress").select("module_id,percent_watched,completed").eq("user_id", user.id),
      ]);
      setMods(m ?? []); setProg(p ?? []); setLoading(false);
    })();
  }, [user]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const pmap = new Map(prog.map(p => [p.module_id, p]));
  const cards = mods.map((m, i) => {
    const p = pmap.get(m.id);
    const prev = i === 0 ? null : mods[i - 1];
    const prevDone = !prev || pmap.get(prev.id)?.completed;
    let state: "locked" | "available" | "in_progress" | "completed" = "locked";
    if (p?.completed) state = "completed";
    else if (prevDone && p && p.percent_watched > 0) state = "in_progress";
    else if (prevDone) state = "available";
    return { ...m, state, percent: p?.percent_watched ?? 0 };
  });

  return (
    <AppShell>
      <section className="container py-10 md:py-14">
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">/ curriculum</div>
        <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight mt-2">All modules</h1>
        <p className="mt-3 text-muted-foreground max-w-xl">Each module unlocks once you complete the previous. Watch 90% or hit Mark Complete.</p>

        <div className="mt-12">
          {loading ? (
            <div className="text-muted-foreground font-mono text-sm">Loading…</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {cards.map(c => (
                <ModuleCard key={c.id} id={c.id} position={c.position} title={c.title}
                  durationSeconds={c.duration_seconds} state={c.state} percent={c.percent} />
              ))}
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
};

export default Learn;
