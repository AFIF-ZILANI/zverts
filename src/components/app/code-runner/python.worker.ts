/// <reference lib="webworker" />
// Runs Python in the browser with Pyodide, so Python code needs no server round
// trip. Lives in a worker so an infinite loop can be killed (the page
// terminates the worker on timeout) without freezing the tab.

import { PYODIDE_URL } from "./cdn";

interface Pyodide {
    runPython: (code: string) => unknown;
    setStdin: (opts: { stdin: () => string | null }) => void;
    setStdout: (opts: { write: (buf: Uint8Array) => number }) => void;
    setStderr: (opts: { write: (buf: Uint8Array) => number }) => void;
    globals: { get: (name: string) => (src: string) => number };
}

// Executes the learner's code as __main__ in a fresh namespace and prints a
// traceback trimmed to their own frames, like running `python main.py`.
const RUNNER = `
import sys, traceback

def __zverts_run(src):
    g = {"__name__": "__main__"}
    try:
        exec(compile(src, "main.py", "exec"), g)
        return 0
    except SystemExit as e:
        if e.code is None:
            return 0
        if isinstance(e.code, int):
            return e.code
        print(e.code, file=sys.stderr)
        return 1
    except BaseException as e:
        traceback.print_exception(type(e), e, e.__traceback__.tb_next)
        return 1
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
`;

let ready: Promise<Pyodide> | null = null;

const load = () =>
    (ready ??= (async () => {
        const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_URL}pyodide.mjs`);
        const py: Pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
        py.runPython(RUNNER);
        return py;
    })());

const sink = (out: string[]) => {
    const decoder = new TextDecoder();
    return {
        write: (buf: Uint8Array) => {
            out.push(decoder.decode(buf, { stream: true }));
            return buf.length;
        },
    };
};

self.onmessage = async (
    e: MessageEvent<{ type: "load" } | { type: "run"; code: string; stdin: string }>,
) => {
    const msg = e.data;
    try {
        const py = await load();
        if (msg.type === "load") {
            self.postMessage({ type: "ready" });
            return;
        }
        let fed = false;
        py.setStdin({
            stdin: () => {
                if (fed || !msg.stdin) return null;
                fed = true;
                return msg.stdin;
            },
        });
        const stdout: string[] = [];
        const stderr: string[] = [];
        py.setStdout(sink(stdout));
        py.setStderr(sink(stderr));

        const started = performance.now();
        const exit = py.globals.get("__zverts_run")(msg.code);
        const time = (performance.now() - started) / 1000;
        self.postMessage({
            type: "result",
            exit,
            stdout: stdout.join(""),
            stderr: stderr.join(""),
            time,
        });
    } catch (err) {
        ready = null;
        self.postMessage({
            type: "error",
            error: err instanceof Error ? err.message : String(err),
        });
    }
};
