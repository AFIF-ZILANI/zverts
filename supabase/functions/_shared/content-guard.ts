// Classifies YouTube videos/playlists as educational or not, via OpenRouter.
// ponytail: fails open (treats as educational) if the classifier call/parse fails,
// so an OpenRouter outage degrades to "no filter" instead of blocking all imports.
export interface GuardItem {
    title: string;
    channel: string;
}

export async function classifyEducational(
    items: GuardItem[],
    apiKey: string,
): Promise<boolean[]> {
    if (items.length === 0) return [];

    const list = items
        .map((it, i) => `${i + 1}. Title: "${it.title}" | Channel: "${it.channel}"`)
        .join("\n");

    const prompt = `You are a content moderator for ZverTs, a disciplined online learning platform. This platform only allows educational content — tutorials, courses, lectures, academic lessons, or skill-building how-tos.

Reject: entertainment, vlogs, music videos, gaming, pranks, reactions, news, comedy, or general commentary that isn't instructional.

Items:
${list}

Return ONLY a JSON array of ${items.length} booleans (true = educational, false = not), in the same order as the items. No other text.`;

    try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://zverts.com",
                "X-Title": "ZverTs Content Guard",
            },
            body: JSON.stringify({
                model: "google/gemini-2.5-flash-lite",
                messages: [{ role: "user", content: prompt }],
                temperature: 0,
            }),
        });

        if (!res.ok) {
            console.error("content-guard: OpenRouter error", res.status, await res.text().catch(() => ""));
            return items.map(() => true);
        }

        const j = await res.json();
        const raw = j.choices?.[0]?.message?.content ?? "[]";
        const match = raw.match(/\[[\s\S]*\]/);
        const parsed = JSON.parse(match ? match[0] : raw);
        if (Array.isArray(parsed) && parsed.length === items.length) {
            return parsed.map(Boolean);
        }
        console.error("content-guard: unexpected classifier response", raw);
        return items.map(() => true);
    } catch (e) {
        console.error("content-guard: classify failed", e);
        return items.map(() => true);
    }
}
