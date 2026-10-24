// Runs learner code (C, C++, Python) and returns its output.
// Backend: Judge0 when JUDGE0_API_KEY or JUDGE0_URL is set, otherwise the free
// Wandbox API (wandbox.org, no key needed).
// JUDGE0_URL defaults to Judge0 CE on RapidAPI; point it at a self-hosted
// Judge0 to drop RapidAPI. JUDGE0_API_KEY is the RapidAPI key, or the
// X-Auth-Token of a self-hosted instance.

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Language = "c" | "cpp" | "python";

interface RunResult {
    status: { id: number; description: string };
    stdout: string;
    stderr: string;
    compileOutput: string;
    message: string;
    time: number | null;
    memory: number | null;
}

// Judge0 status ids, reused for Wandbox results so the client reads one shape.
const ACCEPTED = 3;
const COMPILATION_ERROR = 6;
const RUNTIME_ERROR = 11;

const MAX_SOURCE = 64 * 1024;
const MAX_STDIN = 64 * 1024;
const MAX_OUTPUT = 64 * 1024;

class UpstreamError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}

const truncate = (text: string | null | undefined): string => {
    if (!text) return "";
    return text.length > MAX_OUTPUT ? text.slice(0, MAX_OUTPUT) + "\n… (output truncated)" : text;
};

// ── Judge0 ──

// Judge0 CE language ids: C (GCC 9.2.0), C++ (GCC 9.2.0), Python (3.8.1).
const JUDGE0_LANGUAGE_IDS: Record<Language, number> = { c: 50, cpp: 54, python: 71 };

const toB64 = (s: string) => {
    const bytes = new TextEncoder().encode(s);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
};

const fromB64 = (s: string | null): string => {
    if (!s) return "";
    const bin = atob(s.replace(/\s/g, ""));
    return truncate(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
};

async function runJudge0(lang: Language, source: string, stdin: string): Promise<RunResult> {
    const apiKey = Deno.env.get("JUDGE0_API_KEY");
    const baseUrl = (Deno.env.get("JUDGE0_URL") ?? "https://judge0-ce.p.rapidapi.com").replace(
        /\/$/,
        "",
    );
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (baseUrl.includes("rapidapi.com")) {
        if (!apiKey) throw new UpstreamError("Code runner is not configured", 500);
        headers["X-RapidAPI-Key"] = apiKey;
        headers["X-RapidAPI-Host"] = new URL(baseUrl).host;
    } else if (apiKey) {
        headers["X-Auth-Token"] = apiKey;
    }

    const res = await fetch(
        `${baseUrl}/submissions?base64_encoded=true&wait=true&fields=stdout,stderr,compile_output,message,status,time,memory`,
        {
            method: "POST",
            headers,
            body: JSON.stringify({
                language_id: JUDGE0_LANGUAGE_IDS[lang],
                source_code: toB64(source),
                stdin: toB64(stdin),
                cpu_time_limit: 5,
                wall_time_limit: 10,
                memory_limit: 128000,
            }),
        },
    );
    if (res.status === 429) throw new UpstreamError("Too many runs — try again in a moment.", 429);
    if (!res.ok) {
        console.error("Judge0 error:", res.status, await res.text().catch(() => ""));
        throw new UpstreamError("Code runner is unavailable right now", 502);
    }
    const r = await res.json();
    return {
        status: { id: r.status?.id ?? 0, description: r.status?.description ?? "Unknown" },
        stdout: fromB64(r.stdout),
        stderr: fromB64(r.stderr),
        compileOutput: fromB64(r.compile_output),
        message: fromB64(r.message),
        time: r.time ? Number(r.time) : null,
        memory: r.memory ?? null,
    };
}

// ── Wandbox ──

const WANDBOX = "https://wandbox.org/api";

// Wandbox renames compilers as versions come and go, so pick the newest
// release GCC / CPython from its live list; the "-head" builds are the fallback.
const WANDBOX_PICK: Record<Language, { language: string; prefix: string; fallback: string }> = {
    c: { language: "C", prefix: "gcc-", fallback: "gcc-head-c" },
    cpp: { language: "C++", prefix: "gcc-", fallback: "gcc-head" },
    python: { language: "Python", prefix: "cpython-", fallback: "cpython-head" },
};

let compilerCache: { at: number; names: Partial<Record<Language, string>> } | null = null;

const versionKey = (v: string) => v.split(/[.-]/).map((p) => (/^\d+$/.test(p) ? Number(p) : -1));

const newer = (a: string, b: string) => {
    const x = versionKey(a),
        y = versionKey(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        const d = (x[i] ?? 0) - (y[i] ?? 0);
        if (d) return d > 0;
    }
    return false;
};

async function wandboxCompiler(lang: Language): Promise<string> {
    if (!compilerCache || Date.now() - compilerCache.at > 6 * 60 * 60 * 1000) {
        const names: Partial<Record<Language, string>> = {};
        try {
            const res = await fetch(`${WANDBOX}/list.json`);
            if (res.ok) {
                const list: { name: string; version: string; language: string }[] =
                    await res.json();
                for (const l of Object.keys(WANDBOX_PICK) as Language[]) {
                    const { language, prefix } = WANDBOX_PICK[l];
                    let best: { name: string; version: string } | null = null;
                    for (const c of list) {
                        if (c.language !== language || !c.name.startsWith(prefix)) continue;
                        if (c.name.includes("head")) continue;
                        if (!best || newer(c.version, best.version)) best = c;
                    }
                    if (best) names[l] = best.name;
                }
            }
        } catch (e) {
            console.error("Wandbox list error:", e);
        }
        compilerCache = { at: Date.now(), names };
    }
    return compilerCache.names[lang] ?? WANDBOX_PICK[lang].fallback;
}

async function runWandbox(lang: Language, source: string, stdin: string): Promise<RunResult> {
    const res = await fetch(`${WANDBOX}/compile.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ compiler: await wandboxCompiler(lang), code: source, stdin }),
    });
    if (res.status === 429) throw new UpstreamError("Too many runs — try again in a moment.", 429);
    if (!res.ok) {
        console.error("Wandbox error:", res.status, await res.text().catch(() => ""));
        throw new UpstreamError("Code runner is unavailable right now", 502);
    }
    const r = await res.json();

    const exit = r.status === undefined ? null : Number(r.status);
    const ranProgram = r.program_output !== undefined || r.program_error !== undefined;
    let status: RunResult["status"];
    if (exit === 0) status = { id: ACCEPTED, description: "Accepted" };
    else if (!ranProgram && r.compiler_error)
        status = { id: COMPILATION_ERROR, description: "Compilation Error" };
    else if (r.signal) status = { id: RUNTIME_ERROR, description: `Runtime Error (${r.signal})` };
    else status = { id: RUNTIME_ERROR, description: `Runtime Error (exit code ${exit})` };

    return {
        status,
        stdout: truncate(r.program_output),
        stderr: truncate(r.program_error),
        compileOutput: status.id === COMPILATION_ERROR ? truncate(r.compiler_error) : "",
        message: "",
        time: null,
        memory: null,
    };
}

const jwtClaims = (header: string | null): { role?: string; sub?: string } | null => {
    const payload = header?.replace(/^Bearer\s+/i, "").split(".")[1];
    if (!payload) return null;
    try {
        return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    } catch {
        return null;
    }
};

// Warm the Wandbox compiler list while the isolate boots, not on the first run.
wandboxCompiler("c").catch(() => {});

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    const json = (b: unknown, s = 200) =>
        new Response(JSON.stringify(b), {
            status: s,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    try {
        // The gateway has already verified the JWT (verify_jwt = true in
        // config.toml), so only check it belongs to a signed-in user rather than
        // paying for an auth.getUser() round trip on every run.
        const claims = jwtClaims(req.headers.get("Authorization"));
        if (claims?.role !== "authenticated" || !claims.sub) {
            return json({ error: "Unauthorized" }, 401);
        }

        const { language, source, stdin } = await req.json();
        if (!Object.hasOwn(JUDGE0_LANGUAGE_IDS, language))
            return json({ error: "Unsupported language" }, 400);
        if (typeof source !== "string" || !source.trim()) {
            return json({ error: "Write some code first" }, 400);
        }
        if (source.length > MAX_SOURCE) return json({ error: "Code is too long (64 KB max)" }, 400);
        const input = typeof stdin === "string" ? stdin : "";
        if (input.length > MAX_STDIN) return json({ error: "Input is too long (64 KB max)" }, 400);

        const useJudge0 = !!(Deno.env.get("JUDGE0_API_KEY") || Deno.env.get("JUDGE0_URL"));
        const result = useJudge0
            ? await runJudge0(language, source, input)
            : await runWandbox(language, source, input);
        return json(result);
    } catch (e) {
        if (e instanceof UpstreamError) return json({ error: e.message }, e.status);
        console.error("run-code error:", e);
        return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
    }
});
