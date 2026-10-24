// Monaco with only the editor features and the C/C++/Python grammars, bundled
// locally (no CDN) — the full `monaco-editor` entry pulls in ~80 languages and
// the TypeScript/CSS/HTML/JSON language services, which we don't need.
import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/features/register.all.js";
import "monaco-editor/languages/definitions/cpp/register.js";
import "monaco-editor/languages/definitions/python/register.js";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import { loader } from "@monaco-editor/react";

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

export { monaco };
