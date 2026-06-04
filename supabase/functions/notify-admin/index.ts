import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Optional auth (remove if this is public webhook)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const {
      data: { user },
    } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse payload
    const payment = await req.json();

    if (!payment?.id || !payment?.amount) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const adminChatId = Deno.env.get("ADMIN_CHAT_ID");

    if (!token || !adminChatId) {
      return new Response(JSON.stringify({ error: "Missing Telegram config" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const message =
      `💰 *New Payment Request*\n\n` +
      `Sender: ${payment.sender_number ?? "N/A"}\n` +
      `Txn ID: \`${payment.transaction_id ?? "N/A"}\`\n` +
      `Amount: ৳${payment.amount}\n` +
      `Payment ID: \`${payment.id}\``;

    const keyboard = {
      inline_keyboard: [
        [
          { text: "✅ Confirm", callback_data: `confirm:${payment.id}` },
          { text: "❌ Reject", callback_data: `reject:${payment.id}` },
        ],
      ],
    };

    const telegramRes = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: adminChatId,
          text: message,
          parse_mode: "Markdown",
          reply_markup: keyboard,
        }),
      }
    );

    const telegramData = await telegramRes.json();

    if (!telegramRes.ok) {
      return new Response(JSON.stringify({ error: "Telegram failed", details: telegramData }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, telegram: telegramData }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});