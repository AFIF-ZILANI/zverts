// Versioned CDN locations of the in-browser runtimes. vite.config.ts writes
// these prefixes into /runner-assets.json so the service worker caches exactly
// these versions for offline use — bump here, never in the workers.

/** Pyodide (Python in WebAssembly), ~7 MB compressed. */
export const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/";

/** YoWASP Clang/LLD (C/C++ → WebAssembly), ~19 MB compressed. */
export const CLANG_BASE = "https://cdn.jsdelivr.net/npm/@yowasp/clang@22.0.0-git20542-10/gen/";
export const CLANG_URL = `${CLANG_BASE}bundle.js`;

/**
 * Every file each runtime fetches (checked against a real run). "Download for
 * offline" stores these, and a runtime counts as offline-ready only when all
 * of them are cached. Update alongside a version bump.
 */
export const OFFLINE_FILES = {
    python: [
        "pyodide.mjs",
        "pyodide.asm.js",
        "pyodide.asm.wasm",
        "python_stdlib.zip",
        "pyodide-lock.json",
    ].map((f) => PYODIDE_URL + f),
    clang: [
        "bundle.js",
        "llvm-resources.tar",
        "llvm.core.wasm",
        "llvm.core2.wasm",
        "llvm.core3.wasm",
        "llvm.core4.wasm",
    ].map((f) => CLANG_BASE + f),
};

export const RUNNER_CACHE = "zverts-runner-v1";
