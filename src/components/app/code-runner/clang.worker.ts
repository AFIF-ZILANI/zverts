/// <reference lib="webworker" />
// Compiles C/C++ to WebAssembly in the browser with Clang/LLD (YoWASP build,
// loaded from jsDelivr: ~19 MB compressed; the service worker keeps it for offline use).
// Only compiles — the program itself runs in native.worker.ts, which the page
// can kill on a timeout without losing this warmed-up compiler.

import { CLANG_BASE, CLANG_URL, RUNNER_CACHE } from "./cdn";

type Tree = { [name: string]: Tree | string | Uint8Array };
type RunClang = (
    args: string[],
    files: Tree,
    options: {
        stderr?: (bytes: Uint8Array | null) => void;
        fetchProgress?: (e: { totalLength: number; doneLength: number }) => void;
    },
) => Promise<Tree>;

// GCC's catch-all header; libc++ has no bits/stdc++.h.
const STDCPP = [
    "algorithm",
    "array",
    "bitset",
    "cassert",
    "cctype",
    "cfloat",
    "chrono",
    "climits",
    "cmath",
    "complex",
    "cstdint",
    "cstdio",
    "cstdlib",
    "cstring",
    "ctime",
    "deque",
    "exception",
    "functional",
    "iomanip",
    "iostream",
    "istream",
    "iterator",
    "limits",
    "list",
    "map",
    "memory",
    "numeric",
    "optional",
    "queue",
    "random",
    "set",
    "sstream",
    "stack",
    "stdexcept",
    "string",
    "string_view",
    "tuple",
    "type_traits",
    "unordered_map",
    "unordered_set",
    "utility",
    "valarray",
    "variant",
    "vector",
    "bit",
]
    .map((h) => `#include <${h}>`)
    .join("\n");
// Guarded, so the program's own #include of it is free once the precompiled copy is in.
const STDCPP_H = `#ifndef ZVERTS_BITS_STDCPP\n#define ZVERTS_BITS_STDCPP\n${STDCPP}\n#endif\n`;

// The WASI libc++ is built without exception support, so nothing provides the
// throw entry points. These make `throw` link and behave like an uncaught
// exception does with GCC (catch blocks never run).
const CXX_RUNTIME = `#include <cstdlib>
#include <cstdio>
#include <typeinfo>
namespace abi { extern "C" char* __cxa_demangle(const char*, char*, size_t*, int*); }
extern "C" void* __cxa_allocate_exception(size_t n) throw() {
    void* p = std::malloc(n);
    if (!p) std::abort();
    return p;
}
extern "C" void __cxa_free_exception(void* p) throw() { std::free(p); }
extern "C" void __cxa_throw(void*, std::type_info* ti, void (*)(void*)) {
    int st = 0;
    char* name = abi::__cxa_demangle(ti->name(), nullptr, nullptr, &st);
    std::fflush(stdout);
    std::fprintf(stderr, "terminate called after throwing an instance of '%s'\\n",
                 st == 0 && name ? name : ti->name());
    std::abort();
}
`;

// 8 MB stack like a typical Linux judge (wasm-ld defaults to 64 KB, which
// deep recursion would overflow).
const LINK = ["-Wl,-z,stack-size=8388608"];

// The precompiled header must be built and used with the same language flags.
const CXX = ["clang++", "-std=gnu++20", "-O2"];
const USES_STDCPP = /^\s*#\s*include\s*<bits\/stdc\+\+\.h>/m;

// Built once per Clang version and kept with its files in the runner cache (under
// the CDN prefix, so the service worker keeps it and drops it on a version bump):
// later visits, offline included, skip rebuilding them.
const BUILT = { runtime: `${CLANG_BASE}zverts/rt.o`, pch: `${CLANG_BASE}zverts/stdc++.pch` };
const fromCache = async (url: string) => {
    const res = await caches.match(url).catch(() => undefined);
    return res ? new Uint8Array(await res.arrayBuffer()) : null;
};
const toCache = (url: string, bytes: Uint8Array) =>
    caches
        .open(RUNNER_CACHE)
        .then((c) => c.put(url, new Response(bytes as Uint8Array<ArrayBuffer>)))
        .catch(() => {});

let ready: Promise<{ runClang: RunClang; runtime: Uint8Array }> | null = null;
// Set from the cache, or later by a "pch" message once a helper worker has built it.
let pch: Uint8Array | null = null;

const load = () =>
    (ready ??= (async () => {
        const { runClang } = (await import(/* @vite-ignore */ CLANG_URL)) as { runClang: RunClang };
        const progress = {
            fetchProgress: ({
                doneLength,
                totalLength,
            }: {
                doneLength: number;
                totalLength: number;
            }) => self.postMessage({ type: "progress", done: doneLength, total: totalLength }),
        };
        let runtime = await fromCache(BUILT.runtime);
        if (!runtime) {
            // First call downloads the toolchain; build the C++ runtime with it.
            const out = await runClang(
                [...CXX, "-c", "rt.cpp", "-o", "rt.o"],
                { "rt.cpp": CXX_RUNTIME },
                progress,
            );
            runtime = out["rt.o"] as Uint8Array;
            void toCache(BUILT.runtime, runtime);
        }
        pch ??= await fromCache(BUILT.pch);
        return { runClang, runtime };
    })().catch((e) => {
        ready = null;
        throw e;
    }));

// bits/stdc++.h is ~45 headers: precompiled once, so programs that include it skip
// parsing them (≈0.9 s → ≈0.3 s per compile). Takes a few seconds, so a separate
// copy of this worker builds it while this one keeps compiling without it.
const buildPch = async (runClang: RunClang) => {
    const out = await runClang(
        [...CXX, "-x", "c++-header", "inc/bits/stdc++.h", "-o", "stdc++.pch"],
        { inc: { bits: { "stdc++.h": STDCPP_H } } },
        {},
    ).catch(() => null);
    const built = (out?.["stdc++.pch"] as Uint8Array | undefined) ?? null;
    if (built) await toCache(BUILT.pch, built);
    return built;
};

type Msg =
    | { type: "load" }
    | { type: "build-pch" }
    | { type: "pch"; pch: Uint8Array }
    | { type: "compile"; lang: "c" | "cpp"; code: string };

self.onmessage = async (e: MessageEvent<Msg>) => {
    const msg = e.data;
    if (msg.type === "pch") {
        pch = msg.pch;
        return;
    }
    let tc;
    try {
        tc = await load();
    } catch (err) {
        self.postMessage({
            type: "error",
            error: err instanceof Error ? err.message : String(err),
        });
        return;
    }
    if (msg.type === "load") {
        self.postMessage({ type: "ready", pch: !!pch });
        return;
    }
    if (msg.type === "build-pch") {
        const built = await buildPch(tc.runClang);
        self.postMessage({ type: "pch", pch: built }, built ? [built.buffer] : []);
        return;
    }

    const decoder = new TextDecoder();
    let stderr = "";
    // The header's timestamp differs in each run's fresh file system: skip that check.
    const usePch =
        msg.lang === "cpp" && pch && USES_STDCPP.test(msg.code)
            ? ["-include-pch", "stdc++.pch", "-Xclang", "-fno-validate-pch"]
            : [];
    const args =
        msg.lang === "c"
            ? ["clang", "-std=gnu17", "-O2", ...LINK, "main.c", "-lm", "-o", "main.wasm"]
            : [...CXX, "-Iinc", ...usePch, ...LINK, "main.cpp", "rt.o", "-o", "main.wasm"];
    const files: Tree =
        msg.lang === "c"
            ? { "main.c": msg.code }
            : {
                  "main.cpp": msg.code,
                  "rt.o": tc.runtime,
                  inc: { bits: { "stdc++.h": STDCPP_H } },
                  ...(usePch.length && { "stdc++.pch": pch }),
              };
    const started = performance.now();
    try {
        const out = await tc.runClang(args, files, {
            stderr: (b) => {
                if (b) stderr += decoder.decode(b, { stream: true });
            },
        });
        const wasm = out["main.wasm"] as Uint8Array;
        self.postMessage(
            { type: "compiled", ok: true, wasm, time: (performance.now() - started) / 1000 },
            [wasm.buffer],
        );
    } catch {
        // Exit with a non-zero status: the diagnostics are in stderr.
        self.postMessage({ type: "compiled", ok: false, stderr: stderr.trim() });
    }
};
