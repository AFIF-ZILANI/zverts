/// <reference lib="webworker" />
// Compiles C/C++ to WebAssembly in the browser with Clang/LLD (YoWASP build,
// loaded from jsDelivr: ~19 MB compressed, then browser-cached for a year).
// Only compiles — the program itself runs in native.worker.ts, which the page
// can kill on a timeout without losing this warmed-up compiler.

const CLANG_URL = "https://cdn.jsdelivr.net/npm/@yowasp/clang@22.0.0-git20542-10/gen/bundle.js";

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

let ready: Promise<{ runClang: RunClang; runtime: Uint8Array }> | null = null;

const load = () =>
    (ready ??= (async () => {
        const { runClang } = (await import(/* @vite-ignore */ CLANG_URL)) as { runClang: RunClang };
        // First call downloads the toolchain; build the C++ runtime with it.
        const out = await runClang(
            ["clang++", "-O2", "-c", "rt.cpp", "-o", "rt.o"],
            { "rt.cpp": CXX_RUNTIME },
            {
                fetchProgress: ({ doneLength, totalLength }) =>
                    self.postMessage({ type: "progress", done: doneLength, total: totalLength }),
            },
        );
        return { runClang, runtime: out["rt.o"] as Uint8Array };
    })().catch((e) => {
        ready = null;
        throw e;
    }));

self.onmessage = async (
    e: MessageEvent<{ type: "load" } | { type: "compile"; lang: "c" | "cpp"; code: string }>,
) => {
    const msg = e.data;
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
        self.postMessage({ type: "ready" });
        return;
    }

    const decoder = new TextDecoder();
    let stderr = "";
    const args =
        msg.lang === "c"
            ? ["clang", "-std=gnu17", "-O2", ...LINK, "main.c", "-lm", "-o", "main.wasm"]
            : [
                  "clang++",
                  "-std=gnu++20",
                  "-O2",
                  "-Iinc",
                  ...LINK,
                  "main.cpp",
                  "rt.o",
                  "-o",
                  "main.wasm",
              ];
    const files: Tree =
        msg.lang === "c"
            ? { "main.c": msg.code }
            : { "main.cpp": msg.code, "rt.o": tc.runtime, inc: { bits: { "stdc++.h": STDCPP } } };
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
