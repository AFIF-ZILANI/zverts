import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export const DAILY_LIMIT = 10;

export type UsageState = {
  count: number;
  limit: number;
  remaining: number | null; // null when paid (unlimited)
  paid: boolean;
};

export function useAIUsage() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setUsage(null); setLoading(false); return; }
    const { data, error } = await supabase.rpc("get_ai_usage_today", { _daily_limit: DAILY_LIMIT });
    if (!error && data) setUsage(data as UsageState);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Allow server response header to push fresh numbers without an extra round-trip
  const applyServerUsage = useCallback((u: Partial<UsageState> | null | undefined) => {
    if (!u || typeof u.count !== "number") return;
    setUsage((prev) => ({
      count: u.count ?? prev?.count ?? 0,
      limit: u.limit ?? prev?.limit ?? DAILY_LIMIT,
      remaining: u.remaining ?? null,
      paid: u.paid ?? prev?.paid ?? false,
    }));
  }, []);

  return { usage, loading, refresh, applyServerUsage };
}
