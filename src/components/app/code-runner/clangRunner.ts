import { ACCEPTED, type RunResult } from "./languages";

const COMPILE_LIMIT_MS = 60_000;
const TIME_LIMIT_MS = 10_000;

type CompilerMsg =
    | { type: "progress"; done: number; total: number }
    | { type: "ready"; pch: boolean }
    | { type: "pch"; pch: Uint8Array | null }
    | { type: "error"; error: string }
    | { type: "compiled"; ok: true; wasm: Uint8Array; time: number }
    | { type: "compiled"; ok: false; stderr: string };

interface ProgramMsg {
    exit: number;
    trap: string | null;
    stdout: string;
    stderr: string;
    time: number;
}

/** The compiler couldn't be loaded here (old browser, out of memory, offline). */
export class ClangUnavailable extends Error {}

let compiler: Worker | null = null;
let ready: Promise<void> | null = null;
let onProgress: ((percent: number) => void) | null = null;

export const setClangProgress = (cb: ((percent: number) => void) | null) => {
    onProgress = cb;
};

const reset = () => {
    compiler?.terminate();
    compiler = null;
    ready = null;
    compiled.clear();
};

const newCompilerWorker = () =>
    new Worker(new URL("./clang.worker.ts", import.meta.url), { type: "module" });

// The precompiled bits/stdc++.h isn't cached yet (first visit, or a new Clang
// version): a second compiler worker builds it in the background, then hands it
// over and goes away. Until then programs compile without it, just slower.
const buildPch = () => {
    const helper = newCompilerWorker();
    helper.onmessage = (e: MessageEvent<CompilerMsg>) => {
        if (e.data.type !== "pch") return;
        helper.terminate();
        const { pch } = e.data;
        if (pch) compiler?.postMessage({ type: "pch", pch }, [pch.buffer]);
    };
    helper.onerror = () => helper.terminate();
    helper.postMessage({ type: "build-pch" });
};

// Resolves with the compiler's next reply, reporting download progress on the way.
const reply = (w: Worker) =>
    new Promise<Exclude<CompilerMsg, { type: "progress" }>>((resolve, reject) => {
        w.onmessage = (e: MessageEvent<CompilerMsg>) => {
            const m = e.data;
            if (m.type === "progress") {
                if (m.total) onProgress?.(Math.round((m.done / m.total) * 100));
                return;
            }
            resolve(m);
        };
        w.onerror = (e) => reject(new ClangUnavailable(e.message || "Compiler crashed"));
    });

// Starts the compiler worker and downloads Clang (~19 MB, then browser-cached).
export const preloadClang = (): Promise<void> => {
    if (ready) return ready;
    if (typeof WebAssembly === "undefined")
        return Promise.reject(new ClangUnavailable("No WebAssembly"));
    const w = newCompilerWorker();
    compiler = w;
    ready = reply(w).then((m) => {
        if (m.type !== "ready") {
            throw new ClangUnavailable(m.type === "error" ? m.error : "Compiler failed to load");
        }
        if (!m.pch) buildPch();
    });
    ready.catch(reset);
    w.postMessage({ type: "load" });
    return ready;
};

const withTimeout = <T>(p: Promise<T>, ms: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), ms);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
};

const result = (r: Partial<RunResult> & Pick<RunResult, "status">): RunResult => ({
    stdout: "",
    stderr: "",
    compileOutput: "",
    message: "",
    time: null,
    memory: null,
    ...r,
});

// Engine trap messages differ between browsers; name them like a native run would.
const describeTrap = (trap: string) => {
    if (/unreachable/i.test(trap)) return "Aborted (abort() or an uncaught exception)";
    if (/out of bounds/i.test(trap)) return "Segmentation fault (invalid memory access)";
    if (/call stack|recursion/i.test(trap)) return "Stack overflow (recursion too deep)";
    if (/divide by zero|division by zero/i.test(trap))
        return "Floating point exception (division by zero)";
    return trap;
};

// A program ready to run, or the compile error to show for it.
type Compiled = { module: WebAssembly.Module } | { result: RunResult };

// Same code → same program: running it on several test cases (or re-running with
// new input) compiles once. A few recent programs are kept.
const compiled = new Map<string, Promise<Compiled>>();
const KEEP = 8;

// The compiler worker answers one request at a time.
let queue: Promise<unknown> = Promise.resolve();

const compile = async (lang: "c" | "cpp", code: string): Promise<Compiled> => {
    await preloadClang();
    const w = compiler!;
    const answer = reply(w);
    w.postMessage({ type: "compile", lang, code });
    const m = await withTimeout(answer, COMPILE_LIMIT_MS);
    if (m === "timeout") {
        reset();
        return {
            result: result({
                status: { id: 6, description: "Compilation Error" },
                compileOutput: "Compilation took too long.",
            }),
        };
    }
    if (m.type === "error") {
        reset();
        throw new ClangUnavailable(m.error);
    }
    if (m.type !== "compiled") throw new ClangUnavailable("Unexpected compiler reply");
    if ("stderr" in m) {
        return {
            result: result({
                status: { id: 6, description: "Compilation Error" },
                compileOutput: m.stderr || "Compilation failed.",
            }),
        };
    }
    // Compiled to machine code once here; each run only instantiates it.
    return { module: await WebAssembly.compile(m.wasm as Uint8Array<ArrayBuffer>) };
};

const compileCached = (lang: "c" | "cpp", code: string) => {
    const key = `${lang}\0${code}`;
    let p = compiled.get(key);
    if (p) {
        compiled.delete(key); // re-insert: most recently used last
    } else {
        p = queue.then(() => compile(lang, code));
        queue = p.catch(() => {});
        // A timeout or a lost compiler isn't an answer worth keeping.
        p.then(
            (c) => "result" in c && /too long/.test(c.result.compileOutput) && compiled.delete(key),
            () => compiled.delete(key),
        );
    }
    compiled.set(key, p);
    while (compiled.size > KEEP) compiled.delete(compiled.keys().next().value!);
    return p;
};

// A program worker started ahead of time, so a run doesn't wait for one to boot.
let spare: Worker | null = null;
const newProgramWorker = () =>
    new Worker(new URL("./native.worker.ts", import.meta.url), { type: "module" });
const takeProgramWorker = () => {
    const w = spare ?? newProgramWorker();
    spare = newProgramWorker();
    return w;
};

export const runNative = async (
    lang: "c" | "cpp",
    code: string,
    stdin: string,
): Promise<RunResult> => {
    const c = await compileCached(lang, code);
    if ("result" in c) return c.result;

    // A fresh worker per run, so a timeout can kill it.
    const program = takeProgramWorker();
    const done = new Promise<ProgramMsg>((resolve, reject) => {
        program.onmessage = (e: MessageEvent<ProgramMsg>) => resolve(e.data);
        program.onerror = (e) => reject(new Error(e.message || "Program crashed"));
    });
    program.postMessage({ module: c.module, stdin });
    const ran = await withTimeout(done, TIME_LIMIT_MS).finally(() => program.terminate());

    if (ran === "timeout") {
        return result({
            status: { id: 5, description: "Time Limit Exceeded" },
            message: `Stopped after ${TIME_LIMIT_MS / 1000}s — check for an infinite loop or a missing input.`,
        });
    }
    const time = Math.round(ran.time * 1000) / 1000;
    if (ran.trap === "output-limit") {
        return result({
            status: { id: 11, description: "Output Limit Exceeded" },
            stdout: ran.stdout,
            message: "\nStopped: the program printed more than 1 MB.",
            time,
        });
    }
    if (ran.trap) {
        const reason = describeTrap(ran.trap);
        return result({
            status: { id: 11, description: "Runtime Error" },
            stdout: ran.stdout,
            stderr: ran.stderr,
            message: ran.stderr ? "" : reason,
            time,
        });
    }
    return result({
        status:
            ran.exit === 0
                ? { id: ACCEPTED, description: "Accepted" }
                : { id: 11, description: `Runtime Error (exit code ${ran.exit})` },
        stdout: ran.stdout,
        stderr: ran.stderr,
        time,
    });
};
