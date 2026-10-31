import { useEffect, useRef, useState } from "react";
import type { TestCase } from "./files";

// Problems from the Competitive Companion extension, via public/cph-bridge.mjs.
export const BRIDGE_PORT = 27121;
const BRIDGE = `http://127.0.0.1:${BRIDGE_PORT}/zverts`;

export interface Problem {
    name: string;
    url: string;
    tests: TestCase[];
}

// Anything can post to the bridge: keep only well-formed problems.
export const toProblem = (p: unknown): Problem | null => {
    const o = p as { name?: unknown; url?: unknown; tests?: unknown };
    if (!o || typeof o.name !== "string" || !o.name.trim() || !Array.isArray(o.tests)) return null;
    const tests = o.tests
        .filter(
            (t): t is TestCase =>
                !!t && typeof t.input === "string" && typeof t.output === "string",
        )
        .slice(0, 50)
        .map((t) => ({ input: t.input, output: t.output }));
    return {
        name: o.name.trim().slice(0, 100),
        url: typeof o.url === "string" ? o.url : "",
        tests,
    };
};

// Judges ignore trailing spaces and blank lines at the end.
const normalize = (s: string) =>
    s
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((l) => l.trimEnd())
        .join("\n")
        .trimEnd();
export const sameOutput = (got: string, expected: string) => normalize(got) === normalize(expected);

export type BridgeStatus = "off" | "waiting" | "connected";

export const useCompanion = (enabled: boolean, onProblem: (p: Problem) => void) => {
    const [status, setStatus] = useState<BridgeStatus>("off");
    const cb = useRef(onProblem);
    cb.current = onProblem;

    useEffect(() => {
        if (!enabled) {
            setStatus("off");
            return;
        }
        let stop = false;
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            try {
                const res = await fetch(BRIDGE, { cache: "no-store" });
                const list: unknown = await res.json();
                setStatus("connected");
                for (const raw of Array.isArray(list) ? list : []) {
                    const p = toProblem(raw);
                    if (p) cb.current(p);
                }
            } catch {
                setStatus("waiting");
            }
            if (!stop) timer = setTimeout(poll, 1500);
        };
        void poll();
        return () => {
            stop = true;
            clearTimeout(timer);
        };
    }, [enabled]);

    return status;
};
