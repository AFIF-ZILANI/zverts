const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const body = await req.json();
        const record = body.record;

        if (!record)
            return new Response(JSON.stringify({ error: "No record in payload" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });

        const token = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
        const adminChatId = Deno.env.get("ADMIN_CHAT_ID")!;

        // Escape any characters that would be interpreted by Telegram's HTML parser.
        // Only user-controlled fields need this; enums/integers are safe as-is.
        const esc = (s: string) =>
            s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        const isDupe = (record.prior_count ?? 0) > 0;
        const dupeWarning = isDupe
            ? `\n⚠️ <b>This Txn ID was seen ${record.prior_count} time(s) before!</b>`
            : "";

        const message =
            `💰 <b>New Payment Request</b>${dupeWarning}\n\n` +
            `Package: ${record.package_type}\n` +
            `Credits: ${record.credits}\n` +
            `Amount: ৳${record.amount}\n` +
            `Method: ${record.method}\n` +
            `Sender: <code>${esc(record.sender_number)}</code>\n` +
            `Txn ID: <code>${esc(record.trx_id)}</code>\n` +
            `Payment ID: <code>${record.id}</code>`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: "✅ Confirm", callback_data: `confirm:${record.id}` },
                    { text: "❌ Reject", callback_data: `reject:${record.id}` },
                ],
            ],
        };

        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: adminChatId,
                text: message,
                parse_mode: "HTML",
                reply_markup: keyboard,
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            return new Response(JSON.stringify({ error: err }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
