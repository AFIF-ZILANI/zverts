import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { monaco } from "./monaco";
import { LANGUAGES, type RunLanguage } from "./languages";

// The desktop editor's files. They live in this browser (localStorage) and can
// also be linked to a real file on disk, which then gets every auto-save too.
export interface IdeFile {
    id: string;
    name: string;
    content: string;
}

const FILES_KEY = "zverts.ide.files";
const TABS_KEY = "zverts.ide.tabs";
const MAX_BYTES = 512 * 1024;
const EXTS = [".c", ".cpp", ".cc", ".cxx", ".py", ".txt"];

export const langOf = (name: string): RunLanguage | null => {
    const dot = name.lastIndexOf(".");
    if (dot < 0) return null;
    const ext = name.slice(dot + 1).toLowerCase();
    if (ext === "c") return "c";
    if (ext === "cpp" || ext === "cc" || ext === "cxx") return "cpp";
    if (ext === "py") return "python";
    return null;
};

export const validName = (name: string, files: IdeFile[], selfId?: string): string | null => {
    const n = name.trim();
    if (!n) return "Enter a file name";
    if (n.length > 64) return "Name is too long";
    if (/[\\/:*?"<>|]/.test(n)) return "Name can't contain \\ / : * ? \" < > |";
    if (files.some((f) => f.id !== selfId && f.name.toLowerCase() === n.toLowerCase()))
        return `${n} already exists`;
    return null;
};

// "main.cpp" taken → "main (2).cpp".
export const uniqueName = (name: string, files: IdeFile[]) => {
    const dot = name.lastIndexOf(".");
    const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
    let n = name;
    for (let i = 2; validName(n, files); i++) n = `${base} (${i})${ext}`;
    return n;
};

// Monaco keeps one model (text + undo history) per path.
export const modelPath = (id: string) => `file:///ide/${id}`;

// File System Access API: Chrome/Edge only. Elsewhere we fall back to upload/download.
type FsWindow = {
    showOpenFilePicker?: (o: object) => Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle>;
};
const fsa = (typeof window !== "undefined" ? window : {}) as FsWindow;
const TYPES = [{ description: "Code files", accept: { "text/plain": EXTS } }];

const writeHandle = async (h: FileSystemFileHandle, content: string) => {
    const w = await h.createWritable();
    await w.write(content);
    await w.close();
};

const download = (f: IdeFile) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([f.content], { type: "text/plain" }));
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

const pickWithInput = () =>
    new Promise<File[]>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.accept = EXTS.join(",");
        input.onchange = () => resolve([...(input.files ?? [])]);
        input.click();
    });

const load = <T>(k: string): T | null => {
    try {
        return JSON.parse(localStorage.getItem(k) ?? "null") as T;
    } catch {
        return null;
    }
};

const isFile = (f: unknown): f is IdeFile =>
    !!f &&
    typeof (f as IdeFile).id === "string" &&
    typeof (f as IdeFile).name === "string" &&
    typeof (f as IdeFile).content === "string";

const newFile = (name: string, content = ""): IdeFile => ({
    id: crypto.randomUUID(),
    name,
    content,
});

const disposeModel = (id: string) =>
    monaco.editor.getModel(monaco.Uri.parse(modelPath(id)))?.dispose();

export const useIdeFiles = () => {
    const [files, setFiles] = useState<IdeFile[]>(() => {
        const saved = load<unknown[]>(FILES_KEY);
        const valid = Array.isArray(saved) ? saved.filter(isFile) : [];
        return valid.length ? valid : [newFile("main.cpp")];
    });
    const [{ tabs, active }, setTabState] = useState(() => {
        const saved = load<{ tabs?: string[]; active?: string }>(TABS_KEY);
        const ids = new Set(files.map((f) => f.id));
        const t = (Array.isArray(saved?.tabs) ? saved.tabs : []).filter((id) => ids.has(id));
        if (!t.length) t.push(files[0].id);
        return { tabs: t, active: t.includes(saved?.active) ? saved.active : t[0] };
    });
    const [saving, setSaving] = useState(false);
    // shortcut: disk links live only for this page visit (not kept in IndexedDB);
    // after a reload, Save to disk asks for the file again.
    const handles = useRef(new Map<string, FileSystemFileHandle>());
    const dirty = useRef(new Set<string>());
    const [, rerender] = useReducer((x: number) => x + 1, 0);

    const latest = useRef(files);
    latest.current = files;

    // Auto-save: half a second after typing stops, to the browser and to any linked disk file.
    useEffect(() => {
        const t = setTimeout(async () => {
            try {
                localStorage.setItem(FILES_KEY, JSON.stringify(files));
            } catch {
                toast.error("Couldn't auto-save: browser storage is full.");
            }
            const ids = [...dirty.current];
            dirty.current.clear();
            await Promise.all(
                ids.map(async (id) => {
                    const h = handles.current.get(id);
                    const f = files.find((x) => x.id === id);
                    if (!h || !f) return;
                    await writeHandle(h, f.content).catch(() => {
                        handles.current.delete(id);
                        rerender();
                        toast.error(
                            `Couldn't save ${f.name} to disk. Press Ctrl/⌘ + S to pick it again.`,
                        );
                    });
                }),
            );
            setSaving(false);
        }, 500);
        return () => clearTimeout(t);
    }, [files]);

    // Leaving the page inside that half second must not lose the last keystrokes.
    useEffect(() => {
        const flush = () => {
            try {
                localStorage.setItem(FILES_KEY, JSON.stringify(latest.current));
            } catch {
                /* already reported by the auto-save */
            }
        };
        window.addEventListener("pagehide", flush);
        return () => {
            window.removeEventListener("pagehide", flush);
            flush();
        };
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(TABS_KEY, JSON.stringify({ tabs, active }));
        } catch {
            /* tabs just won't be restored */
        }
    }, [tabs, active]);

    const openTab = (id: string) =>
        setTabState((s) => ({ tabs: s.tabs.includes(id) ? s.tabs : [...s.tabs, id], active: id }));

    const closeTab = (id: string) =>
        setTabState((s) => {
            const i = s.tabs.indexOf(id);
            const next = s.tabs.filter((x) => x !== id);
            return {
                tabs: next,
                active: s.active === id ? (next[Math.min(i, next.length - 1)] ?? null) : s.active,
            };
        });

    const create = (name: string, content = "") => {
        const f = newFile(name.trim(), content);
        setFiles((fs) => [...fs, f]);
        openTab(f.id);
        return f;
    };

    const rename = (id: string, name: string) => {
        // The model keeps its language otherwise: x.txt → x.py must get Python colours.
        const model = monaco.editor.getModel(monaco.Uri.parse(modelPath(id)));
        const lang = langOf(name.trim());
        if (model)
            monaco.editor.setModelLanguage(
                model,
                LANGUAGES.find((l) => l.id === lang)?.monaco ?? "plaintext",
            );
        setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, name: name.trim() } : f)));
    };

    const remove = (id: string) => {
        handles.current.delete(id);
        dirty.current.delete(id);
        disposeModel(id);
        const rest = files.filter((f) => f.id !== id);
        if (rest.length) {
            setFiles(rest);
            closeTab(id);
            return;
        }
        const f = newFile("main.cpp");
        setFiles([f]);
        setTabState({ tabs: [f.id], active: f.id });
    };

    const setContent = useCallback((id: string, content: string) => {
        dirty.current.add(id);
        setSaving(true);
        setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, content } : f)));
    }, []);

    const openFromDisk = async () => {
        let picked: { file: File; handle?: FileSystemFileHandle }[];
        if (fsa.showOpenFilePicker) {
            try {
                const hs = await fsa.showOpenFilePicker({ types: TYPES, multiple: true });
                picked = await Promise.all(
                    hs.map(async (h) => ({ file: await h.getFile(), handle: h })),
                );
            } catch {
                return; // picker cancelled
            }
        } else {
            picked = (await pickWithInput()).map((file) => ({ file }));
        }
        const all = [...latest.current];
        const added: IdeFile[] = [];
        for (const { file, handle } of picked) {
            if (file.size > MAX_BYTES) {
                toast.error(`${file.name} is too big (max 512 KB).`);
                continue;
            }
            const f = newFile(uniqueName(file.name, all), await file.text());
            all.push(f);
            added.push(f);
            if (handle) handles.current.set(f.id, handle);
        }
        if (!added.length) return;
        setFiles((fs) => [...fs, ...added]);
        setTabState((s) => ({ tabs: [...s.tabs, ...added.map((f) => f.id)], active: added[0].id }));
    };

    // Ctrl/⌘ + S. The first time it asks where to save (Desktop by default);
    // after that the file stays linked and every auto-save writes it too.
    const saveToDisk = async (id: string) => {
        const f = latest.current.find((x) => x.id === id);
        if (!f) return;
        let h = handles.current.get(id);
        if (!h) {
            if (!fsa.showSaveFilePicker) {
                download(f);
                return;
            }
            try {
                h = await fsa.showSaveFilePicker({
                    suggestedName: f.name,
                    startIn: "desktop",
                    types: TYPES,
                });
            } catch {
                return; // picker cancelled
            }
        }
        try {
            await writeHandle(h, f.content);
            handles.current.set(id, h);
            rerender();
            toast.success(`Saved ${h.name}`);
        } catch {
            handles.current.delete(id);
            rerender();
            toast.error(`Couldn't save ${f.name}.`);
        }
    };

    return {
        files,
        tabs,
        active: files.find((f) => f.id === active) ?? null,
        saving,
        diskName: (id: string) => handles.current.get(id)?.name ?? null,
        openTab,
        closeTab,
        create,
        rename,
        remove,
        setContent,
        openFromDisk,
        saveToDisk,
    };
};
