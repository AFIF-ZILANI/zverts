import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CHALLENGE_TTL_MS = 60_000;

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return new Response(JSON.stringify({ error: "invalid session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const nonce = crypto.randomUUID() + crypto.randomUUID(); // 64 hex-ish chars of entropy
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();

  const { data, error } = await supabase
    .from("extension_challenges")
    .insert({ user_id: user.id, nonce, expires_at: expiresAt })
    .select("id")
    .single();

  if (error || !data) {
    return new Response(JSON.stringify({ error: "could not create challenge" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ challengeId: data.id, nonce }),
    { headers: { "Content-Type": "application/json" } }
  );
});