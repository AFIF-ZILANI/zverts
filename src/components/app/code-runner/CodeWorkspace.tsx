import { useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { FunctionsFetchError } from "@supabase/supabase-js";
import { Play, RotateCcw, Loader2, Terminal, Keyboard, Maximize2, Minimize2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { monaco } from "./monaco";
import { preloadPython, runPython } from "./pythonRunner";
import { ClangUnavailable, preloadClang, runNative, setClangProgress } from "./clangRunner";
import { ACCEPTED, LANGUAGES, TEMPLATES, type RunLanguage, type RunResult } from "./languages";
import { SymbolBar } from "./SymbolBar";
import { InputPrompt } from "./InputPrompt";
import { readsInput } from "./readsInput";
import "./code-runner.css";

const useCoarsePointer = () => {
    const [coarse, setCoarse] = useState(
        () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
    );
    useEffect(() => {
        const mql = window.matchMedia("(pointer: coarse)");
        const onChange = () => setCoarse(mql.matches);
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
    }, []);
    return coarse;
};

// Per-viewer drafts: code is kept per module + language in localStorage.
const codeKey = (moduleId: string, lang: RunLanguage) => `zverts.code.${moduleId}.${lang}`;
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
        /* storage unavailable — drafts just won't persist */
    }
};

const isLang = (v: string | null): v is RunLanguage => LANGUAGES.some((l) => l.id === v);

export const CodeWorkspace = ({ moduleId }: { moduleId: string }) => {
    const { resolvedTheme } = useTheme();
    const [lang, setLang] = useState<RunLanguage>(() => {
        const saved = read(langKey(moduleId));
        return isLang(saved) ? saved : "cpp";
    });
    const [code, setCode] = useState(() => read(codeKey(moduleId, lang)) ?? TEMPLATES[lang]);
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
    const touch = useCoarsePointer();
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

    useEffect(() => {
        write(codeKey(moduleId, lang), code);
    }, [moduleId, lang, code]);

    const switchLang = (next: RunLanguage) => {
        setLang(next);
        write(langKey(moduleId), next);
        setCode(read(codeKey(moduleId, next)) ?? TEMPLATES[next]);
        setResult(null);
    };

    const reset = () => {
        setCode(TEMPLATES[lang]);
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
        preloadClang()
            .then(() => !cancelled && setClang("ready"))
            .catch(() => !cancelled && setClang("unavailable"));
        return () => {
            cancelled = true;
            setClangProgress(null);
        };
    }, [lang, clang]);

    // Code that reads input but has none: ask for it first instead of running
    // straight into EOF (a "Hello, World!" fallback or garbage from scanf).
    const run = () => {
        if (running) return;
        const reader = readsInput(lang, code);
        if (reader && !stdin.trim()) {
            setAskInput(reader);
            return;
        }
        void execute(stdin);
    };
    runRef.current = run;

    const execute = async (input: string) => {
        setRunning(true);
        setResult(null);
        setIoTab("output");
        // Phones stack the output under the editor — bring it into view.
        if (isMobile && !fullscreen) {
            requestAnimationFrame(() =>
                ioRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
            );
        }
        if (lang === "python") {
            try {
                setResult(await runPython(code, input));
                setPyReady(true);
            } catch (e) {
                setPyReady(false);
                toast.error(e instanceof Error ? e.message : "Python failed to run");
            } finally {
                setRunning(false);
            }
            return;
        }
        if (clang !== "unavailable") {
            try {
                setResult(await runNative(lang, code, input));
                setClang("ready");
                setRunning(false);
                return;
            } catch (e) {
                if (!(e instanceof ClangUnavailable)) {
                    setRunning(false);
                    toast.error(e instanceof Error ? e.message : "Run failed");
                    return;
                }
                setClang("unavailable");
            }
        }
        await runOnServer(input);
    };

    const runOnServer = async (input: string) => {
        const { data, error } = await supabase.functions.invoke("run-code", {
            body: { language: lang, source: code, stdin: input },
        });
        setRunning(false);
        if (error instanceof FunctionsFetchError) {
            // Network/CORS failure — usually the run-code function isn't deployed.
            toast.error("Couldn't reach the code runner. Check your connection and try again.");
            return;
        }
        if (error || data?.error) {
            let msg = data?.error ?? error?.message ?? "Run failed";
            const body = await (error as { context?: Response } | null)?.context
                ?.json?.()
                .catch(() => null);
            if (body?.error) msg = body.error;
            toast.error(msg);
            return;
        }
        setResult(data as RunResult);
    };

    const onMount: OnMount = (ed) => {
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
                        title="Reset to starter code"
                        aria-label="Reset to starter code"
                    >
                        <RotateCcw className="h-4 w-4 sm:h-3.5 sm:w-3.5 sm:mr-1" />
                        <span className="hidden sm:inline">Reset</span>
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 w-9 p-0 sm:h-8 sm:w-8"
                        onClick={() => setFullscreen((f) => !f)}
                        title={fullscreen ? "Exit full screen" : "Full screen"}
                        aria-label={fullscreen ? "Exit full screen" : "Full screen"}
                    >
                        {fullscreen ? (
                            <Minimize2 className="h-4 w-4" />
                        ) : (
                            <Maximize2 className="h-4 w-4" />
                        )}
                    </Button>
                    <Button
                        size="sm"
                        className="h-9 sm:h-8 px-3 bg-gradient-lime text-primary-foreground shadow-glow"
                        onClick={run}
                        disabled={running}
                        title="Run (Ctrl/⌘ + Enter)"
                    >
                        {running ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                            <Play className="h-3.5 w-3.5 mr-1" />
                        )}
                        Run
                    </Button>
                </div>
            </div>

            {touch && <SymbolBar editor={editor} />}

            {/* Editor */}
            <div
                className={cn(
                    fullscreen ? "flex-1 min-h-0" : "h-[320px] sm:h-[340px] lg:h-[420px]",
                )}
            >
                <Editor
                    language={meta.monaco}
                    value={code}
                    onChange={(v) => setCode(v ?? "")}
                    onMount={onMount}
                    theme={resolvedTheme === "light" ? "vs" : "vs-dark"}
                    loading={<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                    options={{
                        fontSize: isMobile ? 13 : 14,
                        fontFamily:
                            "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
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
                        <textarea
                            value={stdin}
                            onChange={(e) => setStdin(e.target.value)}
                            placeholder="Type input for your program here…"
                            spellCheck={false}
                            autoCapitalize="off"
                            autoCorrect="off"
                            // 16px on phones so iOS doesn't zoom in on focus.
                            className="flex-1 min-h-[140px] resize-none bg-transparent p-3 font-mono text-base md:text-sm outline-none placeholder:text-muted-foreground/60"
                        />
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
                            {running ? (
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
                                    {errorText && (
                                        <span className="text-destructive">{errorText}</span>
                                    )}
                                    {!result.stdout && !errorText && (
                                        <span className="text-muted-foreground">(no output)</span>
                                    )}
                                </>
                            ) : (
                                <span className="text-muted-foreground">
                                    {touch
                                        ? "Tap Run to see output."
                                        : "Press Run (Ctrl/⌘ + Enter) to see output."}
                                </span>
                            )}
                        </pre>
                    </div>
                </div>
            </div>

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
        </div>
    );
};

export default CodeWorkspace;
