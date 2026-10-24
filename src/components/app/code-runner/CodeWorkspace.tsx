import { useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { FunctionsFetchError } from "@supabase/supabase-js";
import { Play, RotateCcw, Loader2, Terminal, Keyboard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

    const run = async () => {
        if (running) return;
        setRunning(true);
        setResult(null);
        if (lang === "python") {
            try {
                setResult(await runPython(code, stdin));
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
                setResult(await runNative(lang, code, stdin));
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
        await runOnServer();
    };
    runRef.current = run;

    const runOnServer = async () => {
        const { data, error } = await supabase.functions.invoke("run-code", {
            body: { language: lang, source: code, stdin },
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

    const onMount: OnMount = (editor) => {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
    };

    const ok = result?.status.id === ACCEPTED;
    const errorText = result ? result.compileOutput || result.stderr || result.message : "";

    return (
        <div className="rounded-xl border border-border overflow-hidden bg-background/60">
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
                <span className="font-mono text-xs px-2 py-1 rounded-md bg-background border border-border">
                    {meta.file}
                </span>
                <Select value={lang} onValueChange={(v) => switchLang(v as RunLanguage)}>
                    <SelectTrigger className="h-8 w-[110px] text-xs">
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
                <div className="ml-auto flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs"
                        onClick={reset}
                        disabled={running}
                        title="Reset to starter code"
                    >
                        <RotateCcw className="h-3.5 w-3.5 sm:mr-1" />
                        <span className="hidden sm:inline">Reset</span>
                    </Button>
                    <Button
                        size="sm"
                        className="h-8 bg-gradient-lime text-primary-foreground shadow-glow"
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

            {/* Editor */}
            <div className="h-[340px] lg:h-[420px]">
                <Editor
                    language={meta.monaco}
                    value={code}
                    onChange={(v) => setCode(v ?? "")}
                    onMount={onMount}
                    theme={resolvedTheme === "light" ? "vs" : "vs-dark"}
                    loading={<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                    options={{
                        fontSize: 14,
                        fontFamily:
                            "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        tabSize: 4,
                        padding: { top: 12 },
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

            {/* Input / Output */}
            <div className="grid md:grid-cols-2 border-t border-border">
                <div className="flex flex-col border-b md:border-b-0 md:border-r border-border">
                    <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono text-muted-foreground border-b border-border">
                        <Keyboard className="h-3.5 w-3.5" /> Input (stdin)
                    </div>
                    <textarea
                        value={stdin}
                        onChange={(e) => setStdin(e.target.value)}
                        placeholder="Type input for your program here…"
                        spellCheck={false}
                        className="flex-1 min-h-[140px] resize-none bg-transparent p-3 font-mono text-sm outline-none placeholder:text-muted-foreground/60"
                    />
                </div>
                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono text-muted-foreground border-b border-border">
                        <Terminal className="h-3.5 w-3.5" /> Output
                        {result && (
                            <span
                                className={cn("ml-auto", ok ? "text-primary" : "text-destructive")}
                            >
                                {result.status.description}
                                {result.time !== null && ` · ${result.time}s`}
                                {result.memory !== null &&
                                    ` · ${(result.memory / 1024).toFixed(1)} MB`}
                            </span>
                        )}
                    </div>
                    <pre className="flex-1 min-h-[140px] max-h-[280px] overflow-auto p-3 font-mono text-sm whitespace-pre-wrap break-words">
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
                                {errorText && <span className="text-destructive">{errorText}</span>}
                                {!result.stdout && !errorText && (
                                    <span className="text-muted-foreground">(no output)</span>
                                )}
                            </>
                        ) : (
                            <span className="text-muted-foreground">
                                Press Run (Ctrl/⌘ + Enter) to see output.
                            </span>
                        )}
                    </pre>
                </div>
            </div>
        </div>
    );
};

export default CodeWorkspace;
