/// <reference lib="webworker" />
// Runs one compiled C/C++ program (wasm32-wasi) with the learner's stdin.
// A fresh worker per run, so the page can terminate it on a timeout.
import { ConsoleStdout, File, OpenFile, WASI } from "@bjorn3/browser_wasi_shim";

const MAX_OUTPUT = 1024 * 1024;

class OutputLimit extends Error {}

// The page sends the program already compiled (WebAssembly.Module): a run only instantiates it.
self.onmessage = async (e: MessageEvent<{ module: WebAssembly.Module; stdin: string }>) => {
    const { module, stdin } = e.data;
    const stdout: string[] = [];
    const stderr: string[] = [];
    let written = 0;
    const sink = (out: string[]) => {
        const decoder = new TextDecoder();
        return new ConsoleStdout((buf) => {
            written += buf.length;
            // Throwing here unwinds out of the program: stops `while(1) printf(...)`.
            if (written > MAX_OUTPUT) throw new OutputLimit();
            out.push(decoder.decode(buf, { stream: true }));
        });
    };

    const wasi = new WASI(
        ["main"],
        [],
        [new OpenFile(new File(new TextEncoder().encode(stdin))), sink(stdout), sink(stderr)],
    );
    const started = performance.now();
    let exit = 0;
    let trap: string | null = null;
    try {
        const instance = await WebAssembly.instantiate(module, {
            wasi_snapshot_preview1: wasi.wasiImport,
        });
        exit = wasi.start(instance as Parameters<WASI["start"]>[0]);
    } catch (err) {
        trap =
            err instanceof OutputLimit
                ? "output-limit"
                : err instanceof Error
                  ? err.message
                  : String(err);
    }
    self.postMessage({
        exit,
        trap,
        stdout: stdout.join(""),
        stderr: stderr.join(""),
        time: (performance.now() - started) / 1000,
    });
};
