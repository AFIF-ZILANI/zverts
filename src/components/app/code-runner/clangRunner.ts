import { ACCEPTED, type RunResult } from "./languages";

const COMPILE_LIMIT_MS = 60_000;
const TIME_LIMIT_MS = 10_000;

type CompilerMsg =
    | { type: "progress"; done: number; total: number }
    | { type: "ready" }
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
    const w = new Worker(new URL("./clang.worker.ts", import.meta.url), { type: "module" });
    compiler = w;
    ready = reply(w).then((m) => {
        if (m.type !== "ready") {
            throw new ClangUnavailable(m.type === "error" ? m.error : "Compiler failed to load");
        }
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

export const runNative = async (
    lang: "c" | "cpp",
    code: string,
    stdin: string,
): Promise<RunResult> => {
    await preloadClang();
    const w = compiler!;
    const answer = reply(w);
    w.postMessage({ type: "compile", lang, code });
    const compiled = await withTimeout(answer, COMPILE_LIMIT_MS);
    if (compiled === "timeout") {
        reset();
        return result({
            status: { id: 6, description: "Compilation Error" },
            compileOutput: "Compilation took too long.",
        });
    }
    if (compiled.type === "error") {
        reset();
        throw new ClangUnavailable(compiled.error);
    }
    if (compiled.type !== "compiled") throw new ClangUnavailable("Unexpected compiler reply");
    if ("stderr" in compiled) {
        return result({
            status: { id: 6, description: "Compilation Error" },
            compileOutput: compiled.stderr || "Compilation failed.",
        });
    }

    const program = new Worker(new URL("./native.worker.ts", import.meta.url), { type: "module" });
    const done = new Promise<ProgramMsg>((resolve, reject) => {
        program.onmessage = (e: MessageEvent<ProgramMsg>) => resolve(e.data);
        program.onerror = (e) => reject(new Error(e.message || "Program crashed"));
    });
    program.postMessage({ wasm: compiled.wasm, stdin }, [compiled.wasm.buffer]);
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
