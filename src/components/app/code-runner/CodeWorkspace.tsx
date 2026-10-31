import { useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { FunctionsFetchError } from "@supabase/supabase-js";
import {
    Play,
    RotateCcw,
    Loader2,
    Terminal,
    Keyboard,
    Maximize2,
    Minimize2,
    PanelLeft,
    PanelBottom,
    LayoutGrid,
    Save,
    X,
    Check,
} from "lucide-react";
import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { EDITOR_THEMES, monaco, type EditorTheme } from "./monaco";
import { preloadPython, runPython } from "./pythonRunner";
import { ClangUnavailable, preloadClang, runNative, setClangProgress } from "./clangRunner";
import { ACCEPTED, LANGUAGES, type RunLanguage, type RunResult } from "./languages";
import { SymbolBar } from "./SymbolBar";
import { InputPrompt } from "./InputPrompt";
import { OfflineStatus } from "./OfflineStatus";
import { readsInput } from "./readsInput";
import { FileExplorer } from "./FileExplorer";
import { canOpenFolder, langOf, modelPath, useIdeFiles } from "./files";
import { TestsPanel, type Verdict } from "./TestsPanel";
import { BRIDGE_PORT, sameOutput, useCompanion, type Problem } from "./companion";
import { takeHashProblem } from "./bookmarklet";
import "./code-runner.css";

const useMedia = (query: string) => {
    const [match, setMatch] = useState(
        () => typeof window !== "undefined" && window.matchMedia(query).matches,
    );
    useEffect(() => {
        const mql = window.matchMedia(query);
        const onChange = () => setMatch(mql.matches);
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
    }, [query]);
    return match;
};

// Desktop layout preferences: where the Input/Output panel sits, and what's shown.
type IoPos = "bottom" | "right" | "left" | "top";
type Layout = {
    io: IoPos;
    swap: boolean;
    explorer: boolean;
    panel: boolean;
    theme: EditorTheme;
    fontSize: number;
    /** Poll the Competitive Companion bridge (public/cph-bridge.mjs). */
    companion: boolean;
};
const LAYOUT_KEY = "zverts.ide.layout";
const DEFAULT_LAYOUT: Layout = {
    io: "bottom",
    swap: false,
    explorer: true,
    panel: true,
    theme: "auto",
    fontSize: 14,
    companion: false,
};
const FONT_SIZES = [12, 13, 14, 16, 18, 20];

const CPP_TEMPLATE = `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}
`;

// Phones and tablets: only the language choice is remembered; code always starts empty.
// Laptops/desktops get the file explorer instead (files.ts), which auto-saves.
const langKey = (moduleId: string) => `zverts.code.${moduleId}.lang`;
const read = (k: string) => {
    try {
        return localStorage.getItem(k);
    } catch {
        return null;
    }
};
const write = (k: string, v: string) => {
    try {
        localStorage.setItem(k, v);
    } catch {
        /* storage unavailable — the language choice just won't persist */
    }
};

const isLang = (v: string | null): v is RunLanguage => LANGUAGES.some((l) => l.id === v);

const NOT_OFFLINE_YET = (what: string) =>
    `${what} isn't saved for offline use yet. Connect to the internet once and tap "Download for offline".`;

export const CodeWorkspace = ({ moduleId }: { moduleId: string }) => {
    const { resolvedTheme } = useTheme();
    const [mobileLang, setLang] = useState<RunLanguage>(() => {
        const saved = read(langKey(moduleId));
        return isLang(saved) ? saved : "cpp";
    });
    const [mobileCode, setCode] = useState("");
    const [stdin, setStdin] = useState("");
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<RunResult | null>(null);
    const [pyReady, setPyReady] = useState(false);
    const [clang, setClang] = useState<"loading" | "ready" | "unavailable">("loading");
    const [clangPercent, setClangPercent] = useState(0);
    const runRef = useRef<() => void>(() => {});
    const ioRef = useRef<HTMLDivElement>(null);
    const [editor, setEditor] = useState<Monaco.editor.ICodeEditor | null>(null);
    const isMobile = useIsMobile();
    const touch = useMedia("(pointer: coarse)");
    const desktop = useMedia("(min-width: 1024px) and (pointer: fine)");
    const ide = useIdeFiles();
    const file = ide.active;
    const lang: RunLanguage = desktop ? ((file ? langOf(file.name) : null) ?? "cpp") : mobileLang;
    const code = desktop ? (file?.content ?? "") : mobileCode;
    const runnable = !desktop || (!!file && !!langOf(file.name));
    const [layout, setLayoutState] = useState<Layout>(() => {
        try {
            return { ...DEFAULT_LAYOUT, ...JSON.parse(read(LAYOUT_KEY) ?? "{}") };
        } catch {
            return DEFAULT_LAYOUT;
        }
    });
    const setLayout = (patch: Partial<Layout>) =>
        setLayoutState((l) => {
            const next = { ...l, ...patch };
            write(LAYOUT_KEY, JSON.stringify(next));
            return next;
        });
    const [ioTab, setIoTab] = useState<"input" | "output">("input");
    const [fullscreen, setFullscreen] = useState(false);
    const [askInput, setAskInput] = useState<string | null>(null);

    // Full screen covers the page: stop the page behind it from scrolling.
    useEffect(() => {
        if (!fullscreen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [fullscreen]);

    const meta = LANGUAGES.find((l) => l.id === lang)!;

    const switchLang = (next: RunLanguage) => {
        setLang(next);
        write(langKey(moduleId), next);
        setResult(null);
    };

    const reset = () => {
        setCode("");
        setResult(null);
    };

    // Python runs in the browser: start downloading Pyodide as soon as it's picked.
    useEffect(() => {
        if (lang !== "python") return;
        let cancelled = false;
        preloadPython()
            .then(() => !cancelled && setPyReady(true))
            .catch(() => !cancelled && setPyReady(false));
        return () => {
            cancelled = true;
        };
    }, [lang]);

    // C/C++ compile in the browser too (Clang → WebAssembly); download it once
    // C or C++ is picked. If it can't load here, runs fall back to the server.
    useEffect(() => {
        if (lang === "python" || clang === "unavailable") return;
        let cancelled = false;
        setClangProgress((p) => !cancelled && setClangPercent(p));
        const load = () =>
            preloadClang()
                .then(() => !cancelled && setClang("ready"))
                // Offline is not "unavailable": try again once the connection is back.
                .catch(() => !cancelled && navigator.onLine && setClang("unavailable"));
        void load();
        window.addEventListener("online", load);
        return () => {
            cancelled = true;
            setClangProgress(null);
            window.removeEventListener("online", load);
        };
    }, [lang, clang]);

    // Code that reads input but has none: ask for it first instead of running
    // straight into EOF (a "Hello, World!" fallback or garbage from scanf).
    const run = () => {
        if (running) return;
        if (!runnable) {
            toast.error(
                file
                    ? "Only .c, .cpp and .py files can run. Rename the file to run it."
                    : "Open a file to run.",
            );
            return;
        }
        const reader = readsInput(lang, code);
        if (reader && !stdin.trim()) {
            setAskInput(reader);
            return;
        }
        void execute(stdin);
    };
    runRef.current = () => (desktop && ioMode === "tests" && tests.length ? runTests() : run());

    // Ctrl/⌘ + S anywhere in the workspace saves the open file to the computer.
    const saveRef = useRef<() => void>(() => {});
    saveRef.current = () => file && void ide.saveToDisk(file.id);
    useEffect(() => {
        if (!desktop) return;
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                saveRef.current();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [desktop]);

    // One run of the current code. Throws a readable error instead of toasting,
    // so the single Run and the CP test runner can report it their own way.
    const runOnce = async (input: string): Promise<RunResult> => {
        if (lang === "python") {
            try {
                const r = await runPython(code, input);
                setPyReady(true);
                return r;
            } catch (e) {
                setPyReady(false);
                throw new Error(
                    navigator.onLine
                        ? e instanceof Error
                            ? e.message
                            : "Python failed to run"
                        : NOT_OFFLINE_YET("Python"),
                );
            }
        }
        if (clang !== "unavailable") {
            try {
                const r = await runNative(lang, code, input);
                setClang("ready");
                return r;
            } catch (e) {
                if (!(e instanceof ClangUnavailable)) throw e;
                // Offline: the server fallback can't help either.
                if (!navigator.onLine) throw new Error(NOT_OFFLINE_YET("The C/C++ compiler"));
                setClang("unavailable");
            }
        }
        return runOnServer(input);
    };

    const execute = async (input: string) => {
        setRunning(true);
        setResult(null);
        setIoTab("output");
        setIoMode("io");
        if (!layout.panel) setLayout({ panel: true });
        // Phones stack the output under the editor — bring it into view.
        if (isMobile && !fullscreen) {
            requestAnimationFrame(() =>
                ioRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
            );
        }
        try {
            setResult(await runOnce(input));
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Run failed");
        } finally {
            setRunning(false);
        }
    };

    const runOnServer = async (input: string): Promise<RunResult> => {
        const { data, error } = await supabase.functions.invoke("run-code", {
            body: { language: lang, source: code, stdin: input },
        });
        if (error instanceof FunctionsFetchError) {
            // Network/CORS failure — usually the run-code function isn't deployed.
            throw new Error("Couldn't reach the code runner. Check your connection and try again.");
        }
        if (error || data?.error) {
            let msg = data?.error ?? error?.message ?? "Run failed";
            const body = await (error as { context?: Response } | null)?.context
                ?.json?.()
                .catch(() => null);
            if (body?.error) msg = body.error;
            throw new Error(msg);
        }
        return data as RunResult;
    };

    // ---- CP test cases (CPH-style) ----
    const tests = ide.tests(file);
    const [verdicts, setVerdicts] = useState<(Verdict | undefined)[]>([]);
    const [testIndex, setTestIndex] = useState(-1);
    const [ioMode, setIoMode] = useState<"io" | "tests">("io");
    // A different file's tests: old verdicts don't apply; show its tests if it has any.
    const fileId = file?.id;
    useEffect(() => {
        setVerdicts([]);
        setIoMode(ide.tests(ide.active).length ? "tests" : "io");
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only on file switch
    }, [fileId]);

    const runTests = async (only?: number) => {
        if (running || testIndex >= 0) return;
        if (!runnable) return run();
        if (!layout.panel) setLayout({ panel: true });
        setIoMode("tests");
        const which = only === undefined ? tests.map((_, i) => i) : [only];
        setVerdicts((v) => (only === undefined ? [] : v));
        for (const i of which) {
            setTestIndex(i);
            let v: Verdict;
            try {
                const r = await runOnce(tests[i].input);
                const out = r.stdout ?? "";
                v =
                    r.status.id !== ACCEPTED
                        ? {
                              label: r.status.description,
                              pass: false,
                              got: out + (r.compileOutput || r.stderr || r.message || ""),
                              time: r.time,
                          }
                        : sameOutput(out, tests[i].output)
                          ? { label: "Passed", pass: true, got: out, time: r.time }
                          : { label: "Wrong answer", pass: false, got: out, time: r.time };
            } catch (e) {
                v = {
                    label: "Error",
                    pass: false,
                    got: e instanceof Error ? e.message : "",
                    time: null,
                };
            }
            setVerdicts((all) => {
                const next = [...all];
                next[i] = v;
                return next;
            });
            // A compile error fails every test the same way: stop there.
            if (v.label === "Compilation Error") break;
        }
        setTestIndex(-1);
    };

    // A problem from Competitive Companion or the "Send to Zverts" bookmarklet.
    const onProblem = (p: Problem) => {
        const ext =
            file && langOf(file.name) ? file.name.slice(file.name.lastIndexOf(".") + 1) : "cpp";
        const template =
            ext === "py"
                ? ""
                : ext === "c"
                  ? "#include <stdio.h>\n\nint main(void) {\n\n    return 0;\n}\n"
                  : CPP_TEMPLATE;
        void ide.importProblem(p.name, ext, template, p.tests);
        setVerdicts([]);
        setIoMode("tests");
        setLayout({ panel: true });
        toast.success(
            `${p.name}: ${p.tests.length} test case${p.tests.length === 1 ? "" : "s"} added`,
        );
    };
    const companion = useCompanion(desktop && layout.companion, onProblem);
    const onProblemRef = useRef(onProblem);
    onProblemRef.current = onProblem;
    // The bookmarklet opens /code#cph=… (or changes the hash of the tab it opened before).
    useEffect(() => {
        if (!desktop) return;
        const take = () => {
            const p = takeHashProblem();
            if (p) onProblemRef.current(p);
        };
        take();
        window.addEventListener("hashchange", take);
        return () => window.removeEventListener("hashchange", take);
    }, [desktop]);

    const onMount: OnMount = (ed) => {
        // Ctrl/⌘ + Enter runs; with the Tests tab open it runs all test cases, like CPH.
        ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
        setEditor(ed);
    };

    const ok = result?.status.id === ACCEPTED;
    const errorText = result ? result.compileOutput || result.stderr || result.message : "";
    const statusText = result
        ? `${result.status.description}${result.time !== null ? ` · ${result.time}s` : ""}${
              result.memory !== null ? ` · ${(result.memory / 1024).toFixed(1)} MB` : ""
          }`
        : "";

    const editorEl = (
        <Editor
            // Desktop: one Monaco model per file (keeps undo history); the model owns the text.
            {...(desktop && file
                ? { path: modelPath(file.id), defaultValue: file.content }
                : { value: code })}
            language={desktop && !runnable ? "plaintext" : meta.monaco}
            onChange={(v) =>
                desktop ? file && ide.setContent(file.id, v ?? "") : setCode(v ?? "")
            }
            onMount={onMount}
            theme={
                desktop && layout.theme !== "auto"
                    ? layout.theme
                    : resolvedTheme === "light"
                      ? "zverts-light"
                      : "zverts-dark"
            }
            loading={<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            options={{
                // Desktop: Monaco keeps a placeholder drawn after switching to a file with text.
                placeholder: desktop ? undefined : `Write your ${meta.label} code here…`,
                fontSize: isMobile ? 13 : desktop ? layout.fontSize : 14,
                fontLigatures: true,
                bracketPairColorization: { enabled: true },
                guides: { bracketPairs: "active", indentation: true },
                cursorBlinking: "smooth",
                cursorSmoothCaretAnimation: "on",
                stickyScroll: { enabled: desktop },
                mouseWheelZoom: desktop,
                fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 4,
                padding: { top: isMobile ? 8 : 12 },
                // Phones: wrap long lines and slim the gutter so code
                // fits the width instead of scrolling sideways.
                wordWrap: isMobile ? "on" : "off",
                lineNumbersMinChars: isMobile ? 2 : 5,
                lineDecorationsWidth: isMobile ? 6 : 10,
                folding: !isMobile,
                glyphMargin: false,
                scrollbar: {
                    verticalScrollbarSize: isMobile ? 6 : 10,
                    horizontalScrollbarSize: isMobile ? 6 : 10,
                },
                renderLineHighlight: "all",
                smoothScrolling: true,
                // Suggest/hint popups float above the card instead of being clipped by it.
                fixedOverflowWidgets: true,
                // Suggestions as you type, like VS Code. Our provider
                // already includes the file's own identifiers.
                quickSuggestions: { other: true, comments: false, strings: false },
                quickSuggestionsDelay: 0,
                suggestOnTriggerCharacters: true,
                wordBasedSuggestions: "off",
                snippetSuggestions: "inline",
                tabCompletion: "on",
                parameterHints: { enabled: true },
                suggest: { showStatusBar: false, preview: true },
            }}
        />
    );

    const inputArea = (className: string) => (
        <textarea
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            placeholder="Type input for your program here…"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            // 16px on phones so iOS doesn't zoom in on focus.
            className={cn(
                "resize-none bg-transparent p-3 font-mono text-base md:text-sm outline-none placeholder:text-muted-foreground/60",
                className,
            )}
        />
    );

    const outputBody = running ? (
        <span className="text-muted-foreground">
            {lang === "python"
                ? pyReady
                    ? "Running…"
                    : "Loading Python (first time only)…"
                : clang === "loading"
                  ? `Downloading C/C++ compiler (~20 MB, first time only)…${clangPercent > 0 ? ` ${clangPercent}%` : ""}`
                  : "Compiling & running…"}
        </span>
    ) : result ? (
        <>
            {result.stdout}
            {errorText && <span className="text-destructive">{errorText}</span>}
            {!result.stdout && !errorText && (
                <span className="text-muted-foreground">(no output)</span>
            )}
        </>
    ) : (
        <span className="text-muted-foreground">
            {touch ? "Tap Run to see output." : "Press Run (Ctrl/⌘ + Enter) to see output."}
        </span>
    );

    const runButton = (
        <Button
            size="sm"
            className="h-9 sm:h-8 px-3 bg-gradient-lime text-primary-foreground shadow-glow"
            onClick={() => runRef.current()}
            disabled={running || testIndex >= 0}
            title={
                desktop && ioMode === "tests"
                    ? "Run all tests (Ctrl/⌘ + Enter)"
                    : "Run (Ctrl/⌘ + Enter)"
            }
        >
            {running ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
                <Play className="h-3.5 w-3.5 mr-1" />
            )}
            Run
        </Button>
    );

    const fullscreenButton = (
        <Button
            size="sm"
            variant="ghost"
            className="h-9 w-9 p-0 sm:h-8 sm:w-8"
            onClick={() => setFullscreen((f) => !f)}
            title={fullscreen ? "Exit full screen" : "Full screen"}
            aria-label={fullscreen ? "Exit full screen" : "Full screen"}
        >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
    );

    const inputPrompt = (
        <InputPrompt
            reader={askInput}
            onRun={(input) => {
                setAskInput(null);
                setStdin(input);
                void execute(input);
            }}
            onRunWithout={() => {
                setAskInput(null);
                void execute("");
            }}
            onCancel={() => setAskInput(null)}
        />
    );

    if (desktop) {
        const pane = (title: React.ReactNode, body: React.ReactNode) => (
            <div className="flex h-full min-h-0 min-w-0 flex-col">
                <div className="flex items-center gap-1.5 px-3 h-8 shrink-0 text-xs font-mono text-muted-foreground border-b border-border">
                    {title}
                </div>
                {body}
            </div>
        );
        const inputPane = pane(
            <>
                <Keyboard className="h-3.5 w-3.5" /> Input (stdin)
            </>,
            inputArea("flex-1 min-h-0"),
        );
        const outputPane = pane(
            <>
                <Terminal className="h-3.5 w-3.5" /> Output
                {result && !running && (
                    <span
                        className={cn("ml-auto truncate", ok ? "text-primary" : "text-destructive")}
                    >
                        {statusText}
                    </span>
                )}
            </>,
            <pre className="flex-1 min-h-0 overflow-auto p-3 font-mono text-sm whitespace-pre-wrap break-words">
                {outputBody}
            </pre>,
        );
        const side = layout.io === "left" || layout.io === "right";
        const ioFirst = layout.io === "left" || layout.io === "top";
        const [ioA, ioB] = layout.swap ? [outputPane, inputPane] : [inputPane, outputPane];

        const editorPanel = (
            <ResizablePanel id="editor" order={ioFirst ? 2 : 1} defaultSize={65} minSize={20}>
                <div className="flex h-full flex-col">
                    {/* Open file tabs */}
                    <div
                        className="flex shrink-0 overflow-x-auto border-b border-border bg-muted/20"
                        role="tablist"
                    >
                        {ide.tabs.map((id) => {
                            const f = ide.files.find((x) => x.id === id);
                            if (!f) return null;
                            const current = f.id === file?.id;
                            return (
                                <div
                                    key={id}
                                    role="tab"
                                    aria-selected={current}
                                    tabIndex={0}
                                    onClick={() => ide.openTab(id)}
                                    onKeyDown={(e) => e.key === "Enter" && ide.openTab(id)}
                                    // Middle-click closes, like VS Code.
                                    onAuxClick={(e) => e.button === 1 && ide.closeTab(id)}
                                    className={cn(
                                        "group flex items-center gap-1.5 h-9 pl-3 pr-1 shrink-0 cursor-pointer border-r border-border font-mono text-xs",
                                        current
                                            ? "bg-background text-foreground border-t-2 border-t-primary"
                                            : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {f.name}
                                    <button
                                        type="button"
                                        aria-label={`Close ${f.name}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            ide.closeTab(id);
                                        }}
                                        className={cn(
                                            "h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted",
                                            !current && "opacity-0 group-hover:opacity-100",
                                        )}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex-1 min-h-0">
                        {file ? (
                            editorEl
                        ) : (
                            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                                Open a file from the Explorer, or create a new one.
                            </div>
                        )}
                    </div>
                </div>
            </ResizablePanel>
        );
        const ioPanel = layout.panel && (
            <ResizablePanel id="io" order={ioFirst ? 1 : 2} defaultSize={35} minSize={12}>
                <div className="flex h-full flex-col">
                    <div
                        className="flex shrink-0 border-b border-border bg-muted/20 font-mono text-xs"
                        role="tablist"
                    >
                        {(
                            [
                                ["io", "Input / Output"],
                                ["tests", `Tests${tests.length ? ` (${tests.length})` : ""}`],
                            ] as const
                        ).map(([mode, label]) => (
                            <button
                                key={mode}
                                type="button"
                                role="tab"
                                aria-selected={ioMode === mode}
                                onClick={() => setIoMode(mode)}
                                className={cn(
                                    "h-8 px-3 border-b-2 transition-colors",
                                    ioMode === mode
                                        ? "border-primary text-foreground"
                                        : "border-transparent text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="flex-1 min-h-0">
                        {ioMode === "tests" ? (
                            <TestsPanel
                                tests={tests}
                                verdicts={verdicts}
                                runningIndex={testIndex}
                                onChange={(next) => {
                                    if (file) ide.setTests(file, next);
                                    setVerdicts([]);
                                }}
                                onRun={(i) => void runTests(i)}
                            />
                        ) : (
                            <ResizablePanelGroup
                                direction={side ? "vertical" : "horizontal"}
                                autoSaveId={`zverts.ide.io.${side ? "side" : "stack"}`}
                            >
                                <ResizablePanel id="io-a" order={1} minSize={15}>
                                    {ioA}
                                </ResizablePanel>
                                <ResizableHandle withHandle />
                                <ResizablePanel id="io-b" order={2} minSize={15}>
                                    {ioB}
                                </ResizablePanel>
                            </ResizablePanelGroup>
                        )}
                    </div>
                </div>
            </ResizablePanel>
        );

        return (
            <div
                className={cn(
                    "code-runner flex flex-col overflow-hidden bg-background",
                    fullscreen
                        ? "fixed inset-0 z-50 h-[100dvh]"
                        : "rounded-xl border border-border h-[680px]",
                )}
            >
                {/* Toolbar */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40 shrink-0">
                    <Button
                        size="sm"
                        variant="ghost"
                        className={cn("h-8 w-8 p-0", layout.explorer && "text-primary")}
                        onClick={() => setLayout({ explorer: !layout.explorer })}
                        title="Toggle Explorer"
                        aria-label="Toggle Explorer"
                        aria-pressed={layout.explorer}
                    >
                        <PanelLeft className="h-4 w-4" />
                    </Button>
                    <span className="font-mono text-xs truncate">
                        {file?.name ?? "No file open"}
                        {file && (
                            <span className="ml-2 text-muted-foreground">
                                {runnable ? meta.label : "can't run"}
                            </span>
                        )}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-3 text-xs"
                            onClick={() => saveRef.current()}
                            disabled={!file}
                            title="Save to your computer (Ctrl/⌘ + S)"
                        >
                            <Save className="h-3.5 w-3.5 mr-1" /> Save to computer
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0"
                                    title="Layout & settings"
                                    aria-label="Layout & settings"
                                >
                                    <LayoutGrid className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                className="w-60 max-h-[70vh] overflow-y-auto"
                            >
                                <DropdownMenuLabel>Editor theme</DropdownMenuLabel>
                                <DropdownMenuRadioGroup
                                    value={layout.theme}
                                    onValueChange={(v) => setLayout({ theme: v as EditorTheme })}
                                >
                                    {EDITOR_THEMES.map((t) => (
                                        <DropdownMenuRadioItem key={t.id} value={t.id}>
                                            {t.label}
                                        </DropdownMenuRadioItem>
                                    ))}
                                </DropdownMenuRadioGroup>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel>Font size</DropdownMenuLabel>
                                <div className="flex gap-1 px-2 pb-1.5">
                                    {FONT_SIZES.map((n) => (
                                        <button
                                            key={n}
                                            type="button"
                                            onClick={() => setLayout({ fontSize: n })}
                                            className={cn(
                                                "h-7 flex-1 rounded text-xs font-mono",
                                                layout.fontSize === n
                                                    ? "bg-primary text-primary-foreground"
                                                    : "hover:bg-muted",
                                            )}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                                <DropdownMenuSeparator />
                                <DropdownMenuCheckboxItem
                                    checked={layout.companion}
                                    onCheckedChange={(companion) => setLayout({ companion })}
                                >
                                    Competitive Companion (CPH)
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel>Input / Output position</DropdownMenuLabel>
                                <DropdownMenuRadioGroup
                                    value={layout.io}
                                    onValueChange={(v) =>
                                        setLayout({ io: v as IoPos, panel: true })
                                    }
                                >
                                    {(["bottom", "right", "left", "top"] as const).map((pos) => (
                                        <DropdownMenuRadioItem
                                            key={pos}
                                            value={pos}
                                            className="capitalize"
                                        >
                                            {pos}
                                        </DropdownMenuRadioItem>
                                    ))}
                                </DropdownMenuRadioGroup>
                                <DropdownMenuSeparator />
                                <DropdownMenuCheckboxItem
                                    checked={layout.swap}
                                    onCheckedChange={(swap) => setLayout({ swap })}
                                >
                                    Output before Input
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem
                                    checked={layout.explorer}
                                    onCheckedChange={(explorer) => setLayout({ explorer })}
                                >
                                    Show Explorer
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem
                                    checked={layout.panel}
                                    onCheckedChange={(panel) => setLayout({ panel })}
                                >
                                    Show Input / Output
                                </DropdownMenuCheckboxItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                            size="sm"
                            variant="ghost"
                            className={cn("h-8 w-8 p-0", layout.panel && "text-primary")}
                            onClick={() => setLayout({ panel: !layout.panel })}
                            title="Toggle Input / Output"
                            aria-label="Toggle Input / Output"
                            aria-pressed={layout.panel}
                        >
                            <PanelBottom className="h-4 w-4" />
                        </Button>
                        {fullscreenButton}
                        {runButton}
                    </div>
                </div>

                <ResizablePanelGroup
                    direction="horizontal"
                    autoSaveId="zverts.ide.sidebar"
                    className="flex-1 min-h-0"
                >
                    {layout.explorer && (
                        <>
                            <ResizablePanel
                                id="explorer"
                                order={1}
                                defaultSize={20}
                                minSize={12}
                                maxSize={40}
                            >
                                <FileExplorer
                                    files={ide.files.filter((f) => f.path === undefined)}
                                    activeId={file?.id ?? null}
                                    activePath={file?.path ?? null}
                                    folder={ide.folder}
                                    recentFolder={ide.recentFolder}
                                    canOpenFolder={canOpenFolder}
                                    onOpenFolder={() => void ide.openFolder()}
                                    onReopenFolder={() => void ide.reopenFolder()}
                                    onCloseFolder={ide.closeFolder}
                                    onRefreshFolder={() => void ide.refreshFolder()}
                                    onOpenPath={(p) => void ide.openPath(p)}
                                    onCreateInFolder={(d, n, k) => void ide.createInFolder(d, n, k)}
                                    onRenameInFolder={(p, n) => void ide.renameInFolder(p, n)}
                                    onDeleteInFolder={(p) => void ide.deleteInFolder(p)}
                                    diskName={ide.diskName}
                                    onOpen={ide.openTab}
                                    onCreate={(name) => ide.create(name)}
                                    onRename={ide.rename}
                                    onDelete={ide.remove}
                                    onOpenDisk={() => void ide.openFromDisk()}
                                />
                            </ResizablePanel>
                            <ResizableHandle />
                        </>
                    )}
                    <ResizablePanel id="main" order={2} minSize={40}>
                        <ResizablePanelGroup
                            direction={side ? "horizontal" : "vertical"}
                            autoSaveId={`zverts.ide.main.${side ? "side" : "stack"}`}
                        >
                            {ioFirst && ioPanel}
                            {ioFirst && layout.panel && <ResizableHandle withHandle />}
                            {editorPanel}
                            {!ioFirst && layout.panel && <ResizableHandle withHandle />}
                            {!ioFirst && ioPanel}
                        </ResizablePanelGroup>
                    </ResizablePanel>
                </ResizablePanelGroup>

                {/* Status bar */}
                <div className="flex items-center gap-3 px-3 h-7 shrink-0 border-t border-border bg-muted/40 text-[11px] font-mono text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                        {ide.saving ? (
                            <>
                                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                            </>
                        ) : (
                            <>
                                <Check className="h-3 w-3 text-primary" /> Auto-saved
                            </>
                        )}
                    </span>
                    {file && ide.diskName(file.id) && (
                        <span className="truncate">
                            Saving to{" "}
                            {file.path ? `${ide.folder?.name}/${file.path}` : ide.diskName(file.id)}{" "}
                            on your computer
                        </span>
                    )}
                    {layout.companion && (
                        <span
                            className={cn(
                                "inline-flex items-center gap-1 shrink-0",
                                companion === "connected" ? "text-primary" : "text-amber-500",
                            )}
                            title={
                                companion === "connected"
                                    ? "Click Competitive Companion's + on a problem to import it"
                                    : `Run: node cph-bridge.mjs (download it from ${location.origin}/cph-bridge.mjs)`
                            }
                        >
                            ● CPH{" "}
                            {companion === "connected"
                                ? "ready"
                                : `bridge not running (port ${BRIDGE_PORT})`}
                        </span>
                    )}
                    <span className="ml-auto hidden xl:inline">
                        Ctrl/⌘ + Enter run · Ctrl/⌘ + S save
                    </span>
                </div>

                <OfflineStatus auto />
                {inputPrompt}
            </div>
        );
    }

    return (
        <div
            className={cn(
                "code-runner flex flex-col overflow-hidden bg-background",
                fullscreen
                    ? "fixed inset-0 z-50 h-[100dvh] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
                    : "rounded-xl border border-border",
            )}
        >
            {/* Toolbar */}
            <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 border-b border-border bg-muted/40 shrink-0">
                <span className="hidden sm:inline font-mono text-xs px-2 py-1 rounded-md bg-background border border-border">
                    {meta.file}
                </span>
                <Select value={lang} onValueChange={(v) => switchLang(v as RunLanguage)}>
                    <SelectTrigger className="h-9 sm:h-8 w-[96px] sm:w-[110px] text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {LANGUAGES.map((l) => (
                            <SelectItem key={l.id} value={l.id} className="text-xs">
                                {l.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <div className="ml-auto flex items-center gap-1 sm:gap-2">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 w-9 p-0 sm:h-8 sm:w-auto sm:px-3 text-xs"
                        onClick={reset}
                        disabled={running}
                        title="Clear code"
                        aria-label="Clear code"
                    >
                        <RotateCcw className="h-4 w-4 sm:h-3.5 sm:w-3.5 sm:mr-1" />
                        <span className="hidden sm:inline">Clear</span>
                    </Button>
                    {fullscreenButton}
                    {runButton}
                </div>
            </div>

            {touch && <SymbolBar editor={editor} />}

            {/* Editor */}
            <div
                className={cn(
                    fullscreen ? "flex-1 min-h-0" : "h-[320px] sm:h-[340px] lg:h-[420px]",
                )}
            >
                {editorEl}
            </div>

            {/* Input / Output: side by side from md up; tabs on phones. */}
            <div
                ref={ioRef}
                className={cn(
                    "flex flex-col border-t border-border scroll-mt-20",
                    fullscreen && "h-[38%] shrink-0",
                )}
            >
                <div className="md:hidden flex shrink-0 border-b border-border text-xs font-mono">
                    {(["input", "output"] as const).map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setIoTab(tab)}
                            className={cn(
                                "flex-1 min-w-0 flex items-center justify-center gap-1.5 h-10 px-2 border-b-2 transition-colors",
                                ioTab === tab
                                    ? "border-primary text-foreground"
                                    : "border-transparent text-muted-foreground",
                            )}
                        >
                            {tab === "input" ? (
                                <>
                                    <Keyboard className="h-3.5 w-3.5 shrink-0" /> Input
                                </>
                            ) : (
                                <>
                                    <Terminal className="h-3.5 w-3.5 shrink-0" /> Output
                                    {running ? (
                                        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                                    ) : (
                                        result && (
                                            <span
                                                className={cn(
                                                    "truncate",
                                                    ok ? "text-primary" : "text-destructive",
                                                )}
                                            >
                                                · {statusText}
                                            </span>
                                        )
                                    )}
                                </>
                            )}
                        </button>
                    ))}
                </div>
                <div className="grid md:grid-cols-2 flex-1 min-h-0">
                    <div
                        className={cn(
                            "flex flex-col min-h-0 md:border-r border-border",
                            ioTab !== "input" && "hidden md:flex",
                        )}
                    >
                        <div className="hidden md:flex items-center gap-1.5 px-3 py-2 text-xs font-mono text-muted-foreground border-b border-border">
                            <Keyboard className="h-3.5 w-3.5" /> Input (stdin)
                        </div>
                        {inputArea("flex-1 min-h-[140px]")}
                    </div>
                    <div
                        className={cn(
                            "flex flex-col min-w-0 min-h-0",
                            ioTab !== "output" && "hidden md:flex",
                        )}
                    >
                        <div className="hidden md:flex items-center gap-1.5 px-3 py-2 text-xs font-mono text-muted-foreground border-b border-border">
                            <Terminal className="h-3.5 w-3.5" />
                            <span>Output</span>
                            {result && (
                                <span
                                    className={cn(
                                        "ml-auto",
                                        ok ? "text-primary" : "text-destructive",
                                    )}
                                >
                                    {statusText}
                                </span>
                            )}
                        </div>
                        <pre
                            className={cn(
                                "flex-1 min-h-[140px] overflow-auto p-3 font-mono text-sm whitespace-pre-wrap break-words",
                                !fullscreen && "max-h-[280px]",
                            )}
                        >
                            {outputBody}
                        </pre>
                    </div>
                </div>
            </div>

            <OfflineStatus />

            {inputPrompt}
        </div>
    );
};

export default CodeWorkspace;
