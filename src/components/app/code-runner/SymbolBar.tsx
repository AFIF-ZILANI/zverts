import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { ArrowLeft, ArrowRight, ClipboardPaste, Copy, Scissors, TextSelect } from "lucide-react";
import { toast } from "sonner";

// Characters that are buried two or three layers deep on a phone keyboard.
const SYMBOLS = [..."{}()[];<>\"'=+-*/%&|!#:,\\"];

type Key = { label: React.ReactNode; title: string; run: (e: Monaco.editor.ICodeEditor) => void | Promise<void> };

// Touch screens can't long-press to select or reach Ctrl+A/C/X/V in Monaco.
const selected = (e: Monaco.editor.ICodeEditor) => {
    const sel = e.getSelection();
    return sel && !sel.isEmpty() ? sel : null;
};
const copy = async (e: Monaco.editor.ICodeEditor) => {
    const sel = selected(e);
    if (!sel) {
        toast("Select some code first.");
        return false;
    }
    try {
        await navigator.clipboard.writeText(e.getModel()?.getValueInRange(sel) ?? "");
        return true;
    } catch {
        toast.error("Couldn't copy. Allow clipboard access and try again.");
        return false;
    }
};
const replaceSelection = (e: Monaco.editor.ICodeEditor, text: string) => {
    const sel = e.getSelection();
    if (!sel) return;
    e.pushUndoStop();
    e.executeEdits("clipboard", [{ range: sel, text, forceMoveMarkers: true }]);
    e.pushUndoStop();
};

const CLIPBOARD: Key[] = [
    {
        label: <TextSelect className="h-3.5 w-3.5" />,
        title: "Select all",
        run: (e) => {
            const model = e.getModel();
            if (model) e.setSelection(model.getFullModelRange());
        },
    },
    { label: <Copy className="h-3.5 w-3.5" />, title: "Copy", run: (e) => void copy(e) },
    {
        label: <Scissors className="h-3.5 w-3.5" />,
        title: "Cut",
        run: async (e) => {
            if (await copy(e)) replaceSelection(e, "");
        },
    },
    {
        label: <ClipboardPaste className="h-3.5 w-3.5" />,
        title: "Paste",
        run: async (e) => {
            try {
                replaceSelection(e, await navigator.clipboard.readText());
            } catch {
                toast.error("Couldn't paste. Allow clipboard access and try again.");
            }
        },
    },
];

const KEYS: Key[] = [
    ...CLIPBOARD,
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
