// Supabase API keys for Edge Functions.
// New-style keys (sb_secret_… / sb_publishable_…) are set as the SB_SECRET_KEY and
// SB_PUBLISHABLE_KEY function secrets. Until they are, fall back to the legacy JWT
// keys Supabase injects, so functions keep working through the switch-over.
export const serviceRoleKey = (): string =>
    Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export const anonKey = (): string =>
    Deno.env.get("SB_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
