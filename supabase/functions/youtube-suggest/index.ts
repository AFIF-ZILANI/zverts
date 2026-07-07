const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    const json = (b: unknown, s = 200) =>
        new Response(JSON.stringify(b), {
            status: s,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    try {
        // Require authenticated user — prevents anonymous abuse
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) return json({ error: "Unauthorized" }, 401);
        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
        const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
            global: { headers: { Authorization: authHeader } },
        });
        const {
            data: { user },
        } = await sb.auth.getUser();
        if (!user) return json({ error: "Unauthorized" }, 401);

        const { query } = await req.json();
        const q = (query ?? "").trim();
        if (!q) return json({ suggestions: [] });

        // ponytail: unofficial Google suggest endpoint (same one youtube.com's search box
        // uses) — free, no API key, but undocumented and could change without notice.
        const r = await fetch(
            `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(q)}`,
        );
        const data = await r.json();
        return json({ suggestions: (data?.[1] ?? []) as string[] });
    } catch (e) {
        return json({ error: (e as Error).message }, 500);
    }
});
