import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { ArrowLeft, ArrowRight } from "lucide-react";

// Characters that are buried two or three layers deep on a phone keyboard.
const SYMBOLS = [..."{}()[];<>\"'=+-*/%&|!#:,\\"];

type Key = { label: React.ReactNode; title: string; run: (e: Monaco.editor.ICodeEditor) => void };

const KEYS: Key[] = [
    { label: "Tab", title: "Tab", run: (e) => e.trigger("keyboard", "tab", null) },
    {
        label: <ArrowLeft className="h-3.5 w-3.5" />,
        title: "Cursor left",
        run: (e) => e.trigger("keyboard", "cursorLeft", null),
    },
    {
        label: <ArrowRight className="h-3.5 w-3.5" />,
        title: "Cursor right",
        run: (e) => e.trigger("keyboard", "cursorRight", null),
    },
    // Source "keyboard" + "type" takes Monaco's typing path: "(" auto-closes to "()".
    ...SYMBOLS.map((s) => ({
        label: s,
        title: s,
        run: (e: Monaco.editor.ICodeEditor) => e.trigger("keyboard", "type", { text: s }),
    })),
];

/** A row of hard-to-reach coding keys for touch screens, like mobile code editors have. */
export const SymbolBar = ({ editor }: { editor: Monaco.editor.ICodeEditor | null }) => (
    <div className="flex gap-1 overflow-x-auto px-2 py-1.5 border-b border-border bg-muted/30 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {KEYS.map((k) => (
            <button
                key={k.title}
                type="button"
                title={k.title}
                // Keep focus (and the phone keyboard) in the editor.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                    if (!editor) return;
                    editor.focus();
                    k.run(editor);
                }}
                className="shrink-0 min-w-[36px] h-9 px-2 rounded-md border border-border bg-background font-mono text-sm flex items-center justify-center active:bg-primary/20 active:border-primary/50"
            >
                {k.label}
            </button>
        ))}
    </div>
);
