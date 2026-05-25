import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Prefs = {
  user_id: string;
  mute_all: boolean;
  study_reminders: boolean;
  ai_suggestions: boolean;
  system_alerts: boolean;
  gamification: boolean;
  comeback: boolean;
  max_per_day: number;
  quiet_hours_start: number;
  quiet_hours_end: number;
};

const DEFAULTS: Omit<Prefs, "user_id"> = {
  mute_all: false, study_reminders: true, ai_suggestions: true,
  system_alerts: true, gamification: true, comeback: true,
  max_per_day: 4, quiet_hours_start: 0, quiet_hours_end: 7,
};

export const SmartNotificationSettings = () => {
  const { user } = useAuth();
  const [p, setP] = useState<Prefs | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle();
      setP((data as Prefs) ?? { user_id: user.id, ...DEFAULTS });
    })();
  }, [user]);

  if (!p) return null;
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setP({ ...p, [k]: v });

  const save = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("notification_preferences").upsert({ ...p, user_id: user.id });
    setBusy(false);
    if (error) toast.error(error.message); else toast.success("Saved!");
  };

  const row = (label: string, body: string, k: keyof Prefs) => (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="font-medium text-sm">{label}</div>
        <p className="text-xs text-muted-foreground">{body}</p>
      </div>
      <Switch checked={!!p[k]} onCheckedChange={(v) => set(k, v as never)} />
    </div>
  );

  return (
    <div className="rounded-2xl border border-border bg-gradient-card p-6 shadow-card space-y-5 mt-4">
      <div>
        <div className="font-semibold">Smart in-app notifications</div>
        <p className="text-xs text-muted-foreground">Bangla study-buddy alerts — real-time, behaviour-aware.</p>
      </div>
      {row("Mute all", "Pause every category except critical alerts.", "mute_all")}
      <div className="border-t border-border/60 pt-4 space-y-4">
        {row("Study reminders", "Morning, evening, night nudges + streak risk.", "study_reminders")}
        {row("Gamification", "XP, level up, streak milestones, badges.", "gamification")}
        {row("AI suggestions", "Summaries, generated quizzes, weak-topic alerts.", "ai_suggestions")}
        {row("System alerts", "Playlist conversion, payments, subscription.", "system_alerts")}
        {row("Comeback nudges", "Get pulled back after gaps of 1/3/7/14 days.", "comeback")}
      </div>
      <div className="border-t border-border/60 pt-4 space-y-3">
        <Label className="text-sm">Max notifications per day: <span className="font-semibold text-primary">{p.max_per_day}</span></Label>
        <Slider value={[p.max_per_day]} min={1} max={10} step={1} onValueChange={([v]) => set("max_per_day", v)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Quiet from</Label>
          <input type="number" min={0} max={23} value={p.quiet_hours_start}
            onChange={(e) => set("quiet_hours_start", Math.min(23, Math.max(0, +e.target.value)))}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Quiet until</Label>
          <input type="number" min={0} max={23} value={p.quiet_hours_end}
            onChange={(e) => set("quiet_hours_end", Math.min(23, Math.max(0, +e.target.value)))}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />
        </div>
      </div>
      <Button onClick={save} disabled={busy} className="bg-gradient-lime text-primary-foreground hover:opacity-90 shadow-glow">
        Save smart preferences
      </Button>
    </div>
  );
};
