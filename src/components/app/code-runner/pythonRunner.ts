import { ACCEPTED, type RunResult } from "./languages";

const TIME_LIMIT_MS = 10_000;

type WorkerMsg =
    | { type: "ready" }
    | { type: "result"; exit: number; stdout: string; stderr: string; time: number }
    | { type: "error"; error: string };

let worker: Worker | null = null;
let ready: Promise<void> | null = null;

const nextMessage = (w: Worker) =>
    new Promise<WorkerMsg>((resolve, reject) => {
        w.onmessage = (e: MessageEvent<WorkerMsg>) => resolve(e.data);
        w.onerror = (e) => reject(new Error(e.message || "Python failed to load"));
    });

const reset = () => {
    worker?.terminate();
    worker = null;
    ready = null;
};

// Starts the worker and downloads Pyodide (~7 MB, then browser-cached). Called
// when Python is picked so the first Run doesn't pay the load.
export const preloadPython = (): Promise<void> => {
    if (ready) return ready;
    const w = new Worker(new URL("./python.worker.ts", import.meta.url), { type: "module" });
    worker = w;
    ready = nextMessage(w).then((m) => {
        if (m.type !== "ready")
            throw new Error(m.type === "error" ? m.error : "Python failed to load");
    });
    ready.catch(reset);
    w.postMessage({ type: "load" });
    return ready;
};

export const runPython = async (code: string, stdin: string): Promise<RunResult> => {
    await preloadPython();
    const w = worker!;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), TIME_LIMIT_MS);
    });
    const reply = nextMessage(w);
    w.postMessage({ type: "run", code, stdin });
    const msg = await Promise.race([reply, timeout]).finally(() => clearTimeout(timer));

    if (msg === "timeout") {
        // The only way to stop a running Python loop is to kill the worker.
        reset();
        return {
            status: { id: 5, description: "Time Limit Exceeded" },
            stdout: "",
            stderr: "",
            compileOutput: "",
            message: `Stopped after ${TIME_LIMIT_MS / 1000}s — check for an infinite loop or a missing input.`,
            time: null,
            memory: null,
        };
    }
    if (msg.type !== "result") {
        reset();
        throw new Error(msg.type === "error" ? msg.error : "Python run failed");
    }
    return {
        status:
            msg.exit === 0
                ? { id: ACCEPTED, description: "Accepted" }
                : { id: 11, description: "Runtime Error" },
        stdout: msg.stdout,
        stderr: msg.stderr,
        compileOutput: "",
        message: "",
        time: Math.round(msg.time * 1000) / 1000,
        memory: null,
    };
};
