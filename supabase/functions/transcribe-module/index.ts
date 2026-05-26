// Phase 1 stub: queues a transcript row. Phase 2 will replace this with
// a Gemini-audio worker that downloads the YouTube audio, transcribes it,
// chunks + embeds, then sets status='ready'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { module_id } = await req.json();
    if (!module_id || typeof module_id !== "string") return json({ error: "module_id required" }, 400);

    // RLS: only owners/admins can write a transcript row
    const { data: existing, error: selErr } = await userClient
      .from("transcripts")
      .select("module_id,status")
      .eq("module_id", module_id)
      .maybeSingle();
    if (selErr) return json({ error: selErr.message }, 400);

    if (existing) {
      return json({ ok: true, status: existing.status, queued: false });
    }

    const { error: insErr } = await userClient
      .from("transcripts")
      .insert({ module_id, status: "queued" });
    if (insErr) return json({ error: insErr.message }, 400);

    return json({ ok: true, status: "queued", queued: true });
  } catch (e) {
    console.error("transcribe-module error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
