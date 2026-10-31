import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { monaco } from "./monaco";
import { LANGUAGES, type RunLanguage } from "./languages";

// The desktop editor's files. Browser files live in localStorage; files from an
// opened folder (or opened/saved one by one) are written back to disk on every auto-save.
export interface IdeFile {
    id: string;
    name: string;
    content: string;
    /** Set for files of the opened folder: path inside it, e.g. "contest/A.cpp". */
    path?: string;
}

export interface TestCase {
    input: string;
    output: string;
}

export interface FolderEntry {
    path: string;
    kind: "file" | "directory";
    handle: FileSystemHandle;
}

const FILES_KEY = "zverts.ide.files";
const TABS_KEY = "zverts.ide.tabs";
const TESTS_KEY = "zverts.ide.tests";
const MAX_BYTES = 512 * 1024;
const MAX_ENTRIES = 3000;
const EXTS = [".c", ".cpp", ".cc", ".cxx", ".h", ".hpp", ".py", ".txt", ".in", ".out", ".md"];
// Not worth listing in a code folder; also keeps a huge project from freezing the walk.
const SKIP_DIRS = new Set(["node_modules", "__pycache__", "build", "dist", "venv", "target"]);

export const langOf = (name: string): RunLanguage | null => {
    const dot = name.lastIndexOf(".");
    if (dot < 0) return null;
    const ext = name.slice(dot + 1).toLowerCase();
    if (ext === "c") return "c";
    if (ext === "cpp" || ext === "cc" || ext === "cxx") return "cpp";
    if (ext === "py") return "python";
    return null;
};

export const monacoLang = (name: string) =>
    LANGUAGES.find((l) => l.id === langOf(name))?.monaco ?? "plaintext";

export const validName = (
    name: string,
    files: { id?: string; name: string }[],
    selfId?: string,
): string | null => {
    const n = name.trim();
    if (!n) return "Enter a file name";
    if (n.length > 64) return "Name is too long";
    if (/[\\/:*?"<>|]/.test(n)) return "Name can't contain \\ / : * ? \" < > |";
    if (n === "." || n === "..") return "Not a valid name";
    if (files.some((f) => f.id !== selfId && f.name.toLowerCase() === n.toLowerCase()))
        return `${n} already exists`;
    return null;
};

// "main.cpp" taken → "main (2).cpp".
export const uniqueName = (name: string, files: { name: string }[]) => {
    const dot = name.lastIndexOf(".");
    const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
    let n = name;
    for (let i = 2; validName(n, files); i++) n = `${base} (${i})${ext}`;
    return n;
};

// "A. Watermelon" → "A_Watermelon": a problem title as a file name.
export const problemFileName = (title: string, ext: string) =>
    `${
        title
            .replace(/[\\/:*?"<>|.]+/g, " ")
            .trim()
            .replace(/\s+/g, "_")
            .slice(0, 50) || "problem"
    }.${ext}`;

const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const baseOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

// Monaco keeps one model (text + undo history) per path.
export const modelPath = (id: string) => `file:///ide/${id}`;

// File System Access API: Chrome/Edge only. Elsewhere we fall back to upload/download.
type Perm = { mode: "read" | "readwrite" };
type PermHandle = FileSystemHandle & {
    queryPermission?: (p: Perm) => Promise<PermissionState>;
    requestPermission?: (p: Perm) => Promise<PermissionState>;
};
type FsWindow = {
    showOpenFilePicker?: (o: object) => Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle>;
    showDirectoryPicker?: (o: object) => Promise<FileSystemDirectoryHandle>;
};
const fsa = (typeof window !== "undefined" ? window : {}) as FsWindow;
export const canOpenFolder = !!fsa.showDirectoryPicker;
const TYPES = [{ description: "Code files", accept: { "text/plain": EXTS } }];
const RW: Perm = { mode: "readwrite" };

// Asking for write access opens a browser prompt. Do it once, when a file or folder
// is opened (a click), never from an auto-save while someone is typing.
const askWrite = async (h: FileSystemHandle) =>
    ((await (h as PermHandle).requestPermission?.(RW).catch(() => "denied")) ?? "granted") ===
    "granted";
const canWrite = async (h: FileSystemHandle) =>
    ((await (h as PermHandle).queryPermission?.(RW).catch(() => "denied")) ?? "granted") ===
    "granted";

const writeHandle = async (h: FileSystemFileHandle, content: string) => {
    const w = await h.createWritable();
    await w.write(content);
    await w.close();
};

const readHandle = async (h: FileSystemFileHandle) => {
    const file = await h.getFile();
    if (file.size > MAX_BYTES) throw new Error(`${file.name} is too big to open (max 512 KB).`);
    return file.text();
};

const walk = async (dir: FileSystemDirectoryHandle, prefix = "", out: FolderEntry[] = []) => {
    const children = (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values();
    for await (const h of children) {
        if (out.length >= MAX_ENTRIES) break;
        if (h.name.startsWith(".") || SKIP_DIRS.has(h.name)) continue;
        const path = prefix ? `${prefix}/${h.name}` : h.name;
        out.push({ path, kind: h.kind, handle: h });
        if (h.kind === "directory") await walk(h as FileSystemDirectoryHandle, path, out);
    }
    return out;
};

const sortEntries = (es: FolderEntry[]) =>
    es.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

// The opened folder's handle survives a reload in IndexedDB (localStorage can't hold
// it); reopening it still needs a click to grant access again.
const idb = <T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest) =>
    new Promise<T>((resolve, reject) => {
        const open = indexedDB.open("zverts-ide", 1);
        open.onupgradeneeded = () => open.result.createObjectStore("kv");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const tx = open.result.transaction("kv", mode);
            const req = op(tx.objectStore("kv"));
            tx.oncomplete = () => resolve(req.result as T);
            tx.onerror = () => reject(tx.error);
        };
    });

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
const save = (k: string, v: unknown) => {
    try {
        localStorage.setItem(k, JSON.stringify(v));
        return true;
    } catch {
        return false;
    }
};

const isFile = (f: unknown): f is IdeFile =>
    !!f &&
    typeof (f as IdeFile).id === "string" &&
    typeof (f as IdeFile).name === "string" &&
    typeof (f as IdeFile).content === "string" &&
    (f as IdeFile).path === undefined;

const newFile = (name: string, content = "", path?: string): IdeFile => ({
    id: crypto.randomUUID(),
    name,
    content,
    ...(path !== undefined && { path }),
});

const getModel = (id: string) => monaco.editor.getModel(monaco.Uri.parse(modelPath(id)));

// Only browser files go to localStorage; folder files already live on disk.
const browserFiles = (fs: IdeFile[]) => fs.filter((f) => f.path === undefined);

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
    const [folder, setFolder] = useState<{
        name: string;
        root: FileSystemDirectoryHandle;
        entries: FolderEntry[];
    } | null>(null);
    const [recentFolder, setRecentFolder] = useState<FileSystemDirectoryHandle | null>(null);
    // CP test cases per file: browser files by id, folder files by "folder/path".
    const [tests, setTestsState] = useState<Record<string, TestCase[]>>(
        () => load<Record<string, TestCase[]>>(TESTS_KEY) ?? {},
    );
    const [saving, setSaving] = useState(false);
    // Files opened or saved one at a time (not from the folder) keep their disk handle
    // for this page visit only; after a reload, Ctrl/⌘ + S asks for the file again.
    const handles = useRef(new Map<string, FileSystemFileHandle>());
    const dirty = useRef(new Set<string>());
    const [, rerender] = useReducer((x: number) => x + 1, 0);

    const latest = useRef(files);
    latest.current = files;
    const folderRef = useRef(folder);
    folderRef.current = folder;

    useEffect(() => {
        if (!canOpenFolder) return;
        idb<FileSystemDirectoryHandle | undefined>("readonly", (s) => s.get("folder"))
            .then((h) => h && setRecentFolder(h))
            .catch(() => {});
    }, []);

    // Auto-save: half a second after typing stops, to the browser and to disk.
    useEffect(() => {
        const t = setTimeout(async () => {
            if (!save(FILES_KEY, browserFiles(files)))
                toast.error("Couldn't auto-save: browser storage is full.");
            const ids = [...dirty.current];
            dirty.current.clear();
            await Promise.all(
                ids.map(async (id) => {
                    const h = handles.current.get(id);
                    const f = files.find((x) => x.id === id);
                    if (!h || !f) return;
                    // No access any more (revoked, or after a reload): don't pop a prompt mid-typing.
                    const ok =
                        (await canWrite(h)) &&
                        (await writeHandle(h, f.content).then(
                            () => true,
                            () => false,
                        ));
                    if (ok) return;
                    if (f.path === undefined) handles.current.delete(id);
                    rerender();
                    toast.error(`Couldn't save ${f.name} to disk. Press Ctrl/⌘ + S to try again.`, {
                        id: `save-${id}`,
                    });
                }),
            );
            setSaving(false);
        }, 500);
        return () => clearTimeout(t);
    }, [files]);

    // Leaving the page inside that half second must not lose the last keystrokes.
    useEffect(() => {
        const flush = () => save(FILES_KEY, browserFiles(latest.current));
        window.addEventListener("pagehide", flush);
        return () => {
            window.removeEventListener("pagehide", flush);
            flush();
        };
    }, []);

    useEffect(() => {
        save(TABS_KEY, { tabs, active });
    }, [tabs, active]);

    const openTab = (id: string) =>
        setTabState((s) => ({ tabs: s.tabs.includes(id) ? s.tabs : [...s.tabs, id], active: id }));

    const closeTabs = (ids: string[]) =>
        setTabState((s) => {
            const i = s.tabs.findIndex((x) => ids.includes(x));
            const next = s.tabs.filter((x) => !ids.includes(x));
            return {
                tabs: next,
                active: ids.includes(s.active)
                    ? (next[Math.min(i, next.length - 1)] ?? null)
                    : s.active,
            };
        });
    const closeTab = (id: string) => closeTabs([id]);

    const forget = (ids: string[]) => {
        for (const id of ids) {
            handles.current.delete(id);
            dirty.current.delete(id);
            getModel(id)?.dispose();
        }
    };

    const testKey = (f: IdeFile) =>
        f.path !== undefined ? `${folderRef.current?.name}/${f.path}` : f.id;

    const setTests = (f: IdeFile, next: TestCase[]) =>
        setTestsState((all) => {
            const copy = { ...all, [testKey(f)]: next };
            if (!next.length) delete copy[testKey(f)];
            save(TESTS_KEY, copy);
            return copy;
        });

    // ---- Browser files ----

    const create = (name: string, content = "") => {
        const f = newFile(name.trim(), content);
        setFiles((fs) => [...fs, f]);
        openTab(f.id);
        return f;
    };

    const setLanguage = (id: string, name: string) => {
        // The model keeps its language otherwise: x.txt → x.py must get Python colours.
        const model = getModel(id);
        if (model) monaco.editor.setModelLanguage(model, monacoLang(name));
    };

    const rename = (id: string, name: string) => {
        setLanguage(id, name.trim());
        const f = latest.current.find((x) => x.id === id);
        const t = f && tests[testKey(f)];
        setFiles((fs) => fs.map((x) => (x.id === id ? { ...x, name: name.trim() } : x)));
        if (f && t) setTests({ ...f, name: name.trim() }, t);
    };

    const remove = (id: string) => {
        forget([id]);
        const f = latest.current.find((x) => x.id === id);
        if (f) setTests(f, []);
        const rest = files.filter((x) => x.id !== id);
        if (browserFiles(rest).length) {
            setFiles(rest);
            closeTab(id);
            return;
        }
        const fresh = newFile("main.cpp");
        setFiles([...rest, fresh]);
        closeTab(id);
        openTab(fresh.id);
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
                    hs.map(async (h) => ({
                        file: await h.getFile(),
                        // Read-only if access is refused: it still opens, it just won't save back.
                        handle: (await askWrite(h)) ? h : undefined,
                    })),
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
            const f = newFile(uniqueName(file.name, browserFiles(all)), await file.text());
            all.push(f);
            added.push(f);
            if (handle) handles.current.set(f.id, handle);
        }
        if (!added.length) return;
        setFiles((fs) => [...fs, ...added]);
        setTabState((s) => ({
            tabs: [...s.tabs, ...added.map((f) => f.id)],
            active: added[0].id,
        }));
    };

    // Ctrl/⌘ + S. The first time it asks where to save (Desktop by default);
    // after that the file stays linked and every auto-save writes it too.
    const saveToDisk = async (id: string) => {
        const f = latest.current.find((x) => x.id === id);
        if (!f) return;
        let h = handles.current.get(id);
        if (h && !(await askWrite(h))) h = undefined;
        if (!h) {
            if (f.path !== undefined) return toast.error(`No permission to write ${f.name}.`);
            if (!fsa.showSaveFilePicker) return download(f);
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
            if (f.path === undefined) handles.current.delete(id);
            rerender();
            toast.error(`Couldn't save ${f.name}.`);
        }
    };

    // ---- Opened folder ----

    const loadFolder = async (root: FileSystemDirectoryHandle) => {
        // Files of a previous folder close; their text is already on disk.
        const old = latest.current.filter((f) => f.path !== undefined).map((f) => f.id);
        forget(old);
        closeTabs(old);
        setFiles((fs) => browserFiles(fs));
        try {
            setFolder({ name: root.name, root, entries: sortEntries(await walk(root)) });
        } catch {
            toast.error(`Couldn't read the folder ${root.name}.`);
            return;
        }
        setRecentFolder(root);
        void idb("readwrite", (s) => s.put(root, "folder")).catch(() => {});
    };

    const openFolder = async () => {
        let root: FileSystemDirectoryHandle;
        try {
            // One prompt for the whole folder, here, instead of one per save.
            root = await fsa.showDirectoryPicker({ mode: "readwrite", startIn: "desktop" });
        } catch {
            return; // picker cancelled
        }
        await loadFolder(root);
    };

    const reopenFolder = async () => {
        if (recentFolder && (await askWrite(recentFolder))) await loadFolder(recentFolder);
    };

    const closeFolder = () => {
        const ids = latest.current.filter((f) => f.path !== undefined).map((f) => f.id);
        forget(ids);
        closeTabs(ids);
        setFiles((fs) => browserFiles(fs));
        setFolder(null);
        setRecentFolder(null);
        void idb("readwrite", (s) => s.delete("folder")).catch(() => {});
    };

    const refreshFolder = async () => {
        const f = folderRef.current;
        if (!f) return [];
        const entries = sortEntries(await walk(f.root));
        folderRef.current = { ...f, entries };
        setFolder(folderRef.current);
        return entries;
    };

    const dirHandle = (path: string) =>
        path
            ? (folderRef.current?.entries.find((e) => e.path === path)
                  ?.handle as FileSystemDirectoryHandle)
            : folderRef.current?.root;

    const openPath = async (path: string) => {
        const open = latest.current.find((f) => f.path === path);
        if (open) return openTab(open.id);
        const entry = folderRef.current?.entries.find((e) => e.path === path);
        if (!entry || entry.kind !== "file") return;
        const h = entry.handle as FileSystemFileHandle;
        try {
            const f = newFile(baseOf(path), await readHandle(h), path);
            handles.current.set(f.id, h);
            setFiles((fs) => [...fs, f]);
            openTab(f.id);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : `Couldn't open ${path}.`);
        }
    };

    const createInFolder = async (dir: string, name: string, kind: "file" | "directory") => {
        const parent = dirHandle(dir);
        if (!parent) return;
        const n = name.trim();
        const path = dir ? `${dir}/${n}` : n;
        try {
            if (kind === "directory") await parent.getDirectoryHandle(n, { create: true });
            else {
                const h = await parent.getFileHandle(n, { create: true });
                const f = newFile(n, "", path);
                handles.current.set(f.id, h);
                setFiles((fs) => [...fs, f]);
                openTab(f.id);
            }
            await refreshFolder();
        } catch {
            toast.error(`Couldn't create ${n}.`);
        }
    };

    const renameInFolder = async (path: string, name: string) => {
        const entry = folderRef.current?.entries.find((e) => e.path === path);
        const parent = dirHandle(parentOf(path));
        if (!entry || !parent) return;
        const n = name.trim();
        const to = parentOf(path) ? `${parentOf(path)}/${n}` : n;
        const move = (entry.handle as { move?: (name: string) => Promise<void> }).move;
        try {
            if (move) await move.call(entry.handle, n);
            else if (entry.kind === "file") {
                // Older Chrome: copy to the new name, then delete the old file.
                const text = await readHandle(entry.handle as FileSystemFileHandle);
                await writeHandle(await parent.getFileHandle(n, { create: true }), text);
                await parent.removeEntry(entry.handle.name);
            } else return toast.error("This browser can't rename folders. Update Chrome or Edge.");
        } catch {
            return toast.error(`Couldn't rename ${baseOf(path)}.`);
        }
        // Open files under the old path follow it, with their test cases.
        const entries = await refreshFolder();
        const moved = (p: string) =>
            p === path || p.startsWith(`${path}/`) ? to + p.slice(path.length) : p;
        for (const f of latest.current.filter((x) => x.path !== undefined)) {
            const p = moved(f.path);
            if (p === f.path) continue;
            const h = entries.find((e) => e.path === p)?.handle as FileSystemFileHandle;
            if (h) handles.current.set(f.id, h);
            const t = tests[testKey(f)];
            if (t) {
                setTests(f, []);
                setTests({ ...f, path: p }, t);
            }
            setLanguage(f.id, baseOf(p));
        }
        setFiles((fs) =>
            fs.map((f) =>
                f.path !== undefined && moved(f.path) !== f.path
                    ? { ...f, path: moved(f.path), name: baseOf(moved(f.path)) }
                    : f,
            ),
        );
    };

    const deleteInFolder = async (path: string) => {
        const parent = dirHandle(parentOf(path));
        if (!parent) return;
        try {
            await parent.removeEntry(baseOf(path), { recursive: true });
        } catch {
            return toast.error(`Couldn't delete ${baseOf(path)}.`);
        }
        const gone = latest.current.filter(
            (f) => f.path !== undefined && (f.path === path || f.path.startsWith(`${path}/`)),
        );
        gone.forEach((f) => setTests(f, []));
        forget(gone.map((f) => f.id));
        closeTabs(gone.map((f) => f.id));
        const ids = new Set(gone.map((f) => f.id));
        setFiles((fs) => fs.filter((f) => !ids.has(f.id)));
        await refreshFolder();
    };

    // ---- Competitive Companion problems ----

    // New file per problem (in the open folder if there is one) with its sample tests.
    // A problem that was imported before just gets its tests refreshed.
    const importProblem = async (
        title: string,
        ext: string,
        template: string,
        cases: TestCase[],
    ) => {
        const name = problemFileName(title, ext);
        const f = folderRef.current;
        let file = latest.current.find((x) =>
            f ? x.path === name : x.path === undefined && x.name === name,
        );
        if (!file && f) {
            const existing = f.entries.find((e) => e.path === name);
            if (existing) {
                await openPath(name);
            } else {
                try {
                    const h = await f.root.getFileHandle(name, { create: true });
                    await writeHandle(h, template);
                    file = newFile(name, template, name);
                    handles.current.set(file.id, h);
                    setFiles((fs) => [...fs, file]);
                    await refreshFolder();
                } catch {
                    toast.error(`Couldn't create ${name} in ${f.name}.`);
                    return;
                }
            }
            // Already on disk: openPath has opened it; tests key off the path.
            file ??= { id: "", name, content: "", path: name };
        } else if (!file) {
            file = newFile(name, template);
            setFiles((fs) => [...fs, file]);
        }
        setTests(file, cases);
        if (file.id) openTab(file.id);
    };

    return {
        files,
        tabs,
        active: files.find((f) => f.id === active) ?? null,
        saving,
        folder,
        recentFolder: recentFolder?.name ?? null,
        tests: (f: IdeFile | null) => (f ? (tests[testKey(f)] ?? []) : []),
        setTests,
        diskName: (id: string) => handles.current.get(id)?.name ?? null,
        openTab,
        closeTab,
        create,
        rename,
        remove,
        setContent,
        openFromDisk,
        saveToDisk,
        openFolder,
        reopenFolder,
        closeFolder,
        refreshFolder,
        openPath,
        createInFolder,
        renameInFolder,
        deleteInFolder,
        importProblem,
    };
};
