import { useEffect, useState, useCallback } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "@/integrations/supabase/client";

export interface Entitlements {
  free_playlist_used: number;
  free_left: number;
  convert_credits: number;
  ai_enabled: boolean;
  is_paid_user: boolean;
  total_paid: number;
  locked: boolean;
  roles: string[];
  isAdmin: boolean;
  isSuperAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

export const useEntitlements = (): Entitlements => {
  const { user } = useAuth();
  const [state, setState] = useState({
    free_playlist_used: 0, convert_credits: 0, ai_enabled: false,
    is_paid_user: false, total_paid: 0, locked: false, roles: [] as string[],
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const [{ data: ent }, { data: profile }] = await Promise.all([
      supabase.from("user_entitlements").select("free_playlist_used,convert_credits,ai_enabled,is_paid_user,total_paid").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("locked,role").eq("id", user.id).maybeSingle(),
    ]);
    setState({
      free_playlist_used: ent?.free_playlist_used ?? 0,
      convert_credits: ent?.convert_credits ?? 0,
      ai_enabled: ent?.ai_enabled ?? false,
      is_paid_user: ent?.is_paid_user ?? false,
      total_paid: ent?.total_paid ?? 0,
      locked: profile?.locked ?? false,
      roles: profile?.role ? [profile.role] : [],
    });
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Realtime refresh on entitlement or profile changes
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`user:${user.id}:ent:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "user_entitlements", filter: `user_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  return {
    ...state,
    free_left: Math.max(0, 3 - state.free_playlist_used),
    isAdmin: state.roles.includes("admin") || state.roles.includes("super_admin"),
    isSuperAdmin: state.roles.includes("super_admin"),
    loading,
    refresh: load,
  };
};
