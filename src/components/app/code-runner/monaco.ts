// Monaco with only the editor features and the C/C++/Python grammars, bundled
// locally (no CDN) — the full `monaco-editor` entry pulls in ~80 languages and
// the TypeScript/CSS/HTML/JSON language services, which we don't need.
import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/features/register.all.js";
import "monaco-editor/languages/definitions/cpp/register.js";
import "monaco-editor/languages/definitions/python/register.js";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import { loader } from "@monaco-editor/react";
import { registerCompletions } from "./completions";

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
registerCompletions(monaco);

export { monaco };

// Editor themes. "auto" picks Zverts Dark/Light from the site theme.
export const EDITOR_THEMES = [
    { id: "auto", label: "Auto (match site)" },
    { id: "zverts-dark", label: "Zverts Dark" },
    { id: "zverts-light", label: "Zverts Light" },
    { id: "zverts-ocean", label: "Ocean" },
    { id: "vs-dark", label: "Classic Dark" },
    { id: "vs", label: "Classic Light" },
    { id: "hc-black", label: "High Contrast" },
] as const;
export type EditorTheme = (typeof EDITOR_THEMES)[number]["id"];

const syntax = (c: {
    comment: string;
    keyword: string;
    string: string;
    number: string;
    type: string;
    directive: string;
    fg: string;
}) => [
    { token: "", foreground: c.fg },
    { token: "comment", foreground: c.comment, fontStyle: "italic" },
    { token: "keyword", foreground: c.keyword },
    { token: "keyword.directive", foreground: c.directive },
    { token: "keyword.directive.include", foreground: c.directive },
    { token: "string", foreground: c.string },
    { token: "string.include.identifier", foreground: c.string },
    { token: "number", foreground: c.number },
    { token: "type", foreground: c.type },
    { token: "delimiter", foreground: c.fg },
];

monaco.editor.defineTheme("zverts-dark", {
    base: "vs-dark",
    inherit: true,
    rules: syntax({
        fg: "e4e4e7",
        comment: "6b7280",
        keyword: "c084fc",
        string: "86efac",
        number: "fdba74",
        type: "7dd3fc",
        directive: "f472b6",
    }),
    colors: {
        "editor.background": "#131316",
        "editor.foreground": "#e4e4e7",
        "editor.lineHighlightBackground": "#1c1c22",
        "editor.selectionBackground": "#4ade8033",
        "editor.inactiveSelectionBackground": "#4ade801a",
        "editorCursor.foreground": "#4ade80",
        "editorLineNumber.foreground": "#4b4b55",
        "editorLineNumber.activeForeground": "#4ade80",
        "editorIndentGuide.background1": "#26262d",
        "editorBracketMatch.background": "#4ade8022",
        "editorBracketMatch.border": "#4ade8066",
        "editorWidget.background": "#1a1a1f",
        "editorSuggestWidget.background": "#1a1a1f",
        "editorSuggestWidget.selectedBackground": "#4ade8026",
    },
});

monaco.editor.defineTheme("zverts-light", {
    base: "vs",
    inherit: true,
    rules: syntax({
        fg: "27272a",
        comment: "9ca3af",
        keyword: "7c3aed",
        string: "15803d",
        number: "c2410c",
        type: "0369a1",
        directive: "be185d",
    }),
    colors: {
        "editor.background": "#fbfbfa",
        "editor.foreground": "#27272a",
        "editor.lineHighlightBackground": "#f1f5f0",
        "editor.selectionBackground": "#22c55e2e",
        "editorCursor.foreground": "#16a34a",
        "editorLineNumber.foreground": "#c4c4c8",
        "editorLineNumber.activeForeground": "#16a34a",
        "editorBracketMatch.background": "#22c55e1f",
        "editorBracketMatch.border": "#22c55e66",
        "editorSuggestWidget.selectedBackground": "#22c55e22",
    },
});

monaco.editor.defineTheme("zverts-ocean", {
    base: "vs-dark",
    inherit: true,
    rules: syntax({
        fg: "d6deeb",
        comment: "637777",
        keyword: "c792ea",
        string: "ecc48d",
        number: "f78c6c",
        type: "82aaff",
        directive: "7fdbca",
    }),
    colors: {
        "editor.background": "#0b1622",
        "editor.foreground": "#d6deeb",
        "editor.lineHighlightBackground": "#122233",
        "editor.selectionBackground": "#1d3b53",
        "editorCursor.foreground": "#80a4c2",
        "editorLineNumber.foreground": "#3b5068",
        "editorLineNumber.activeForeground": "#c5e4fd",
        "editorWidget.background": "#0f2133",
        "editorSuggestWidget.background": "#0f2133",
    },
});
