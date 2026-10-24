// Delivers a notification to every device the user subscribed for Web Push.
// Called by the notify_push() trigger on public.notifications (pg_net), which
// authenticates with the x-push-secret header (verify_jwt = false).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "npm:web-push@3.6.7";
import { serviceRoleKey } from "../_shared/keys.ts";

const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey());

let webhookSecret: string | null = null;
const expectedSecret = async () => {
    if (webhookSecret) return webhookSecret;
    const { data, error } = await admin.rpc("push_webhook_secret");
    if (error) throw error;
    webhookSecret = data as string;
    return webhookSecret;
};

webpush.setVapidDetails(
    "mailto:zvertsofficial@gmail.com",
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
);

Deno.serve(async (req) => {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    try {
        const provided = req.headers.get("x-push-secret");
        if (!provided || provided !== (await expectedSecret())) {
            return json({ error: "Forbidden" }, 403);
        }

        const { record } = await req.json();
        if (!record?.user_id) return json({ error: "No record in payload" }, 400);

        const { data: subs, error } = await admin
            .from("push_subscriptions")
            .select("id,endpoint,p256dh,auth")
            .eq("user_id", record.user_id);
        if (error) throw error;

        const payload = JSON.stringify({
            id: record.id,
            title: record.title,
            body: record.body,
            deep_link: record.deep_link,
            priority: record.priority,
        });

        let sent = 0;
        const expired: string[] = [];
        await Promise.all(
            (subs ?? []).map(async (s) => {
                try {
                    await webpush.sendNotification(
                        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                        payload,
                        { TTL: 60 * 60 * 12 },
                    );
                    sent++;
                } catch (e) {
                    const status = (e as { statusCode?: number }).statusCode;
                    // 404/410: the browser dropped this subscription — forget it.
                    if (status === 404 || status === 410) expired.push(s.id);
                    else console.error("push failed:", status, (e as Error).message);
                }
            }),
        );

        if (expired.length) await admin.from("push_subscriptions").delete().in("id", expired);
        return json({ sent, removed: expired.length });
    } catch (e) {
        console.error("push-send error:", (e as Error).message);
        return json({ error: (e as Error).message }, 500);
    }
});
