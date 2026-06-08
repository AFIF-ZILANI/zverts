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

        const message =
            `💰 *New Payment Request*\n\n` +
            `Package: ${record.package_type}\n` +
            `Credits: ${record.credits}\n` +
            `Amount: ৳${record.amount}\n` +
            `Method: ${record.method}\n` +
            `Sender: \`${record.sender_number}\`\n` +
            `Txn ID: \`${record.trx_id}\`\n` +
            `Payment ID: \`${record.id}\``;

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
                parse_mode: "Markdown",
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
