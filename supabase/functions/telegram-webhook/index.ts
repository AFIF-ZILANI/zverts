import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    // ── Auth guard 1: Telegram webhook secret token ───────────────────────
    // Telegram sends X-Telegram-Bot-Api-Secret-Token on every update if you
    // registered it via setWebhook { secret_token: "..." }.
    // Without this check, anyone who knows the function URL can approve payments.
    const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
    if (!webhookSecret) {
        console.error("TELEGRAM_WEBHOOK_SECRET env var not set");
        return new Response("misconfigured", { status: 500 });
    }
    const incomingSecret = req.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
    if (incomingSecret !== webhookSecret) {
        return new Response("Forbidden", { status: 403 });
    }

    try {
        const body = await req.json();
        const callbackQuery = body.callback_query;

        if (!callbackQuery) {
            return new Response(JSON.stringify({ ok: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // ── Auth guard 2: caller must be the registered admin ─────────────
        // Prevents a non-admin Telegram user from tapping a forwarded message.
        const adminTgId = parseInt(Deno.env.get("ADMIN_TELEGRAM_ID") ?? "0", 10);
        if (!adminTgId || callbackQuery.from?.id !== adminTgId) {
            return new Response("Forbidden", { status: 403 });
        }

        const data = callbackQuery.data as string;
        const [action, paymentId] = data.split(":");

        if (!action || !paymentId) {
            return new Response(JSON.stringify({ error: "Invalid callback data" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        if (action !== "confirm" && action !== "reject") {
            return new Response(JSON.stringify({ error: "Unknown action" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const label = action === "confirm" ? "APPROVED" : "REJECTED";
        const token = Deno.env.get("TELEGRAM_BOT_TOKEN")!;

        const admin = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        const { error } =
            action === "confirm"
                ? await admin.rpc("svc_approve_payment", {
                      _payment_id: paymentId,
                      _actor_label: "telegram",
                  })
                : await admin.rpc("svc_reject_payment", {
                      _payment_id: paymentId,
                      _actor_label: "telegram",
                      _note: "Rejected via Telegram",
                  });

        if (error) {
            // Tell the admin what went wrong via the button pop-up, then return
            // 200 so Telegram does NOT retry. Retrying would call the same RPC
            // again — useless for "Already processed", harmful for others.
            await answerCallback(token, callbackQuery.id, `❌ ${error.message}`);
            return new Response(JSON.stringify({ error: error.message }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const originalText = callbackQuery.message?.text ?? "";
        await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: callbackQuery.message.chat.id,
                message_id: callbackQuery.message.message_id,
                text: originalText + `\n\n<b>Status: ${label}</b>`,
                parse_mode: "HTML",
                // Empty inline_keyboard removes the Confirm/Reject buttons so
                // the admin cannot accidentally tap them a second time.
                reply_markup: { inline_keyboard: [] },
            }),
        });

        await answerCallback(token, callbackQuery.id, `Marked as ${label}`);

        return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (e) {
        // Return 200 so Telegram stops retrying. An unhandled exception here is
        // a code bug, not a transient condition that retry would fix.
        console.error("telegram-webhook unhandled error:", e);
        return new Response(JSON.stringify({ error: (e as Error).message }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});

async function answerCallback(token: string, callbackQueryId: string, text: string) {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
}
