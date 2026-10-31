import { useState } from "react";
import { BookmarkPlus, Loader2, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TestCase } from "./files";
import { bookmarkletHref } from "./bookmarklet";

// How to get problems in: the "Send to Zverts" bookmark (nothing to install).
const ImportHelp = () => (
    <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-xs space-y-2">
        <p className="font-medium text-foreground">Import a problem in one click</p>
        <ol className="list-decimal pl-4 space-y-1.5 text-muted-foreground">
            <li>
                Drag this to your bookmarks bar:{" "}
                <a
                    // Set outside React: it warns about javascript: URLs in JSX.
                    ref={(a) => a?.setAttribute("href", bookmarkletHref(location.origin))}
                    onClick={(e) => {
                        e.preventDefault();
                        toast.info(
                            "Drag it to your bookmarks bar, then click it on a problem page.",
                        );
                    }}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 font-medium text-primary-foreground cursor-grab"
                >
                    ⭐ Send to Zverts
                </a>
            </li>
            <li>Open a problem on Codeforces, AtCoder or CodeChef.</li>
            <li>Click the bookmark: a file with the sample tests opens here.</li>
        </ol>
        <p className="text-muted-foreground">
            No bookmarks bar? Press Ctrl/⌘ + Shift + B. Using Competitive Companion instead? Turn it
            on in the Layout menu.
        </p>
    </div>
);

export type Verdict = { label: string; pass: boolean; got: string; time: number | null };

const Box = ({
    label,
    value,
    onChange,
    tone,
}: {
    label: string;
    value: string;
    onChange?: (v: string) => void;
    tone?: "pass" | "fail";
}) => (
    <label className="block min-w-0">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            {label}
        </span>
        <textarea
            value={value}
            readOnly={!onChange}
            onChange={(e) => onChange?.(e.target.value)}
            spellCheck={false}
            rows={Math.min(8, Math.max(2, value.split("\n").length))}
            className={cn(
                "code-font mt-1 w-full resize-y rounded-md border bg-background/60 px-2 py-1.5 text-base md:text-xs outline-none focus:border-primary",
                tone === "pass" && "border-primary/50",
                tone === "fail" && "border-destructive/60",
                !tone && "border-border",
            )}
        />
    </label>
);

/** CPH-style test cases: input + expected output, run one or all, pass/fail per case. */
export const TestsPanel = ({
    tests,
    verdicts,
    runningIndex,
    onChange,
    onRun,
}: {
    tests: TestCase[];
    verdicts: (Verdict | undefined)[];
    /** Index being run, or -1. */
    runningIndex: number;
    onChange: (tests: TestCase[]) => void;
    onRun: (index?: number) => void;
}) => {
    const busy = runningIndex >= 0;
    const [help, setHelp] = useState(false);
    const passed = verdicts.filter((v) => v?.pass).length;
    const done = verdicts.filter(Boolean).length;
    const update = (i: number, patch: Partial<TestCase>) =>
        onChange(tests.map((t, j) => (j === i ? { ...t, ...patch } : t)));

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center gap-2 px-3 h-9 shrink-0 border-b border-border">
                {done > 0 && (
                    <span
                        className={cn(
                            "text-xs font-mono",
                            passed === tests.length ? "text-primary" : "text-destructive",
                        )}
                    >
                        {passed}/{tests.length} passed
                    </span>
                )}
                <span className="ml-auto" />
                {tests.length > 0 && (
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setHelp((h) => !h)}
                        aria-pressed={help}
                    >
                        <BookmarkPlus className="h-3.5 w-3.5 mr-1" /> Import
                    </Button>
                )}
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => onChange([...tests, { input: "", output: "" }])}
                >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add test
                </Button>
                <Button
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => onRun()}
                    disabled={busy || !tests.length}
                    title="Run all tests (Ctrl/⌘ + Enter)"
                >
                    {busy ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                        <Play className="h-3.5 w-3.5 mr-1" />
                    )}
                    Run all
                </Button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
                {(!tests.length || help) && <ImportHelp />}
                {tests.map((t, i) => {
                    const v = verdicts[i];
                    return (
                        <div key={i} className="rounded-lg border border-border bg-muted/20 p-2.5">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-mono">Test {i + 1}</span>
                                {runningIndex === i ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                ) : (
                                    v && (
                                        <span
                                            className={cn(
                                                "rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold",
                                                v.pass
                                                    ? "bg-primary/15 text-primary"
                                                    : "bg-destructive/15 text-destructive",
                                            )}
                                        >
                                            {v.label}
                                            {v.time !== null && ` · ${v.time}s`}
                                        </span>
                                    )
                                )}
                                <span className="ml-auto" />
                                <button
                                    type="button"
                                    aria-label={`Run test ${i + 1}`}
                                    title="Run this test"
                                    disabled={busy}
                                    onClick={() => onRun(i)}
                                    className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40"
                                >
                                    <Play className="h-3 w-3" />
                                </button>
                                <button
                                    type="button"
                                    aria-label={`Delete test ${i + 1}`}
                                    title="Delete this test"
                                    disabled={busy}
                                    onClick={() => onChange(tests.filter((_, j) => j !== i))}
                                    className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-muted disabled:opacity-40"
                                >
                                    <Trash2 className="h-3 w-3" />
                                </button>
                            </div>
                            <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
                                <Box
                                    label="Input"
                                    value={t.input}
                                    onChange={(input) => update(i, { input })}
                                />
                                <Box
                                    label="Expected output"
                                    value={t.output}
                                    onChange={(output) => update(i, { output })}
                                />
                            </div>
                            {v && !v.pass && (
                                <div className="mt-2">
                                    <Box label="Your output" value={v.got} tone="fail" />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
