import { useRef, useState } from "react";
import {
    ChevronRight,
    FileCode2,
    FilePlus2,
    FileUp,
    Folder,
    FolderOpen,
    FolderPlus,
    HardDrive,
    Pencil,
    RefreshCw,
    Trash2,
    X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fileIconColor, validName, type FolderEntry, type IdeFile } from "./files";

// What is being named: a browser file (id) or a folder entry (path); new = parent dir.
type Editing = {
    scope: "browser" | "folder";
    mode: "rename" | "file" | "directory";
    target: string;
    value: string;
    error: string | null;
};

const IconButton = ({
    label,
    onClick,
    children,
}: {
    label: string;
    onClick: () => void;
    children: React.ReactNode;
}) => (
    <button
        type="button"
        title={label}
        aria-label={label}
        onClick={(e) => {
            e.stopPropagation();
            onClick();
        }}
        className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
    >
        {children}
    </button>
);

const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const baseOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

const rowClass = (active: boolean) =>
    cn(
        "group flex items-center gap-1.5 pr-1 h-9 md:h-7 cursor-pointer text-[13px] outline-none focus-visible:ring-1 focus-visible:ring-ring",
        active
            ? "bg-primary/10 text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );

/** VS Code-style explorer: an opened folder as a tree, plus files kept in the browser. */
export const FileExplorer = ({
    files,
    activeId,
    activePath,
    diskName,
    onOpen,
    onCreate,
    onRename,
    onDelete,
    onOpenDisk,
    folder,
    recentFolder,
    canOpenFolder,
    onOpenFolder,
    onReopenFolder,
    onCloseFolder,
    onRefreshFolder,
    onOpenPath,
    onCreateInFolder,
    onRenameInFolder,
    onDeleteInFolder,
}: {
    files: IdeFile[];
    activeId: string | null;
    activePath: string | null;
    diskName: (id: string) => string | null;
    onOpen: (id: string) => void;
    onCreate: (name: string) => void;
    onRename: (id: string, name: string) => void;
    onDelete: (id: string) => void;
    onOpenDisk: () => void;
    folder: { name: string; entries: FolderEntry[] } | null;
    recentFolder: string | null;
    canOpenFolder: boolean;
    onOpenFolder: () => void;
    onReopenFolder: () => void;
    onCloseFolder: () => void;
    onRefreshFolder: () => void;
    onOpenPath: (path: string) => void;
    onCreateInFolder: (dir: string, name: string, kind: "file" | "directory") => void;
    onRenameInFolder: (path: string, name: string) => void;
    onDeleteInFolder: (path: string) => void;
}) => {
    const [editing, setEditing] = useState<Editing | false>(false);
    const cancelled = useRef(false);
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    // New files/folders go into the folder last clicked (or the one holding the clicked file).
    const [selectedDir, setSelectedDir] = useState("");

    const entries = folder?.entries ?? [];
    const childrenOf = (dir: string) =>
        entries
            .filter((e) => parentOf(e.path) === dir)
            .sort((a, b) =>
                a.kind !== b.kind
                    ? a.kind === "directory"
                        ? -1
                        : 1
                    : baseOf(a.path).localeCompare(baseOf(b.path), undefined, { numeric: true }),
            );

    const siblings = (e: Editing) =>
        e.scope === "browser"
            ? files
            : childrenOf(e.mode === "rename" ? parentOf(e.target) : e.target).map((x) => ({
                  id: x.path,
                  name: baseOf(x.path),
              }));

    const start = (e: Omit<Editing, "value" | "error">, value = "") => {
        if (e.scope === "folder" && e.mode !== "rename" && e.target)
            setExpanded((s) => new Set(s).add(e.target));
        setEditing({ ...e, value, error: null });
    };

    const commit = () => {
        if (!editing) return;
        const value = editing.value.trim();
        const renaming = editing.mode === "rename";
        const oldName =
            editing.scope === "browser"
                ? files.find((f) => f.id === editing.target)?.name
                : baseOf(editing.target);
        if ((renaming && oldName === value) || (!renaming && !value)) return setEditing(false);
        const error = validName(value, siblings(editing), renaming ? editing.target : undefined);
        if (error) return setEditing({ ...editing, error });
        if (editing.scope === "browser") {
            if (renaming) onRename(editing.target, value);
            else onCreate(value);
        } else if (renaming) onRenameInFolder(editing.target, value);
        else onCreateInFolder(editing.target, value, editing.mode as "file" | "directory");
        setEditing(false);
    };

    const nameInput = (depth = 0) => (
        <div className="py-1 pr-2" style={{ paddingLeft: 8 + depth * 12 }}>
            <input
                autoFocus
                value={editing ? editing.value : ""}
                onChange={(e) =>
                    editing && setEditing({ ...editing, value: e.target.value, error: null })
                }
                // Enter and Escape both end in blur, so a name is committed exactly once.
                onKeyDown={(e) => {
                    if (e.key === "Escape") cancelled.current = true;
                    if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
                }}
                onBlur={() => {
                    if (cancelled.current) setEditing(false);
                    else commit();
                    cancelled.current = false;
                }}
                onFocus={(e) => {
                    // Select the name without the extension, like VS Code.
                    const dot = e.target.value.lastIndexOf(".");
                    e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
                }}
                placeholder={editing && editing.mode === "directory" ? "folder name" : "name.cpp"}
                spellCheck={false}
                aria-label="Name"
                aria-invalid={!!(editing && editing.error)}
                className={cn(
                    "w-full rounded-sm border bg-background px-1.5 py-0.5 font-mono text-xs outline-none",
                    editing && editing.error ? "border-destructive" : "border-primary",
                )}
            />
            {editing && editing.error && (
                <p className="mt-1 text-[11px] text-destructive">{editing.error}</p>
            )}
        </div>
    );

    const isEditing = (scope: Editing["scope"], mode: "rename" | "new", target: string) =>
        editing &&
        editing.scope === scope &&
        editing.target === target &&
        (mode === "rename") === (editing.mode === "rename");

    const toggle = (path: string) =>
        setExpanded((s) => {
            const n = new Set(s);
            if (n.has(path)) n.delete(path);
            else n.add(path);
            return n;
        });

    const removePath = (path: string) => {
        const isDir = entries.find((e) => e.path === path)?.kind === "directory";
        const what = isDir ? `the folder ${baseOf(path)} and everything in it` : baseOf(path);
        if (window.confirm(`Delete ${what} from your computer? This can't be undone.`))
            onDeleteInFolder(path);
    };

    const removeFile = (f: IdeFile) => {
        if (window.confirm(`Delete ${f.name}? This can't be undone.`)) onDelete(f.id);
    };

    const tree = (dir: string, depth: number): React.ReactNode => (
        <>
            {childrenOf(dir).map((e) => {
                const name = baseOf(e.path);
                const isDir = e.kind === "directory";
                const open = expanded.has(e.path);
                const rename = () =>
                    start({ scope: "folder", mode: "rename", target: e.path }, name);
                if (isEditing("folder", "rename", e.path))
                    return <li key={e.path}>{nameInput(depth)}</li>;
                return (
                    <li key={e.path}>
                        <div
                            role="treeitem"
                            aria-expanded={isDir ? open : undefined}
                            aria-selected={e.path === activePath}
                            tabIndex={0}
                            style={{ paddingLeft: 8 + depth * 12 }}
                            className={rowClass(e.path === activePath)}
                            onClick={() => {
                                setSelectedDir(isDir ? e.path : parentOf(e.path));
                                if (isDir) toggle(e.path);
                                else onOpenPath(e.path);
                            }}
                            onDoubleClick={() => !isDir && rename()}
                            onKeyDown={(ev) => {
                                if (ev.key === "Enter") {
                                    if (isDir) toggle(e.path);
                                    else onOpenPath(e.path);
                                }
                                if (ev.key === "F2") rename();
                                if (ev.key === "Delete") removePath(e.path);
                            }}
                        >
                            {isDir ? (
                                <>
                                    <ChevronRight
                                        className={cn(
                                            "h-3.5 w-3.5 shrink-0 transition-transform",
                                            open && "rotate-90",
                                        )}
                                    />
                                    {open ? (
                                        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                                    ) : (
                                        <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                                    )}
                                </>
                            ) : (
                                <FileCode2
                                    className={cn("ml-5 h-3.5 w-3.5 shrink-0", fileIconColor(name))}
                                />
                            )}
                            <span className="truncate">{name}</span>
                            <span className="ml-auto hidden group-hover:flex group-focus-within:flex [@media(pointer:coarse)]:flex">
                                {isDir && (
                                    <IconButton
                                        label={`New file in ${name}`}
                                        onClick={() =>
                                            start({ scope: "folder", mode: "file", target: e.path })
                                        }
                                    >
                                        <FilePlus2 className="h-3 w-3" />
                                    </IconButton>
                                )}
                                <IconButton label={`Rename ${name}`} onClick={rename}>
                                    <Pencil className="h-3 w-3" />
                                </IconButton>
                                <IconButton
                                    label={`Delete ${name}`}
                                    onClick={() => removePath(e.path)}
                                >
                                    <Trash2 className="h-3 w-3" />
                                </IconButton>
                            </span>
                        </div>
                        {isDir && open && <ul role="group">{tree(e.path, depth + 1)}</ul>}
                    </li>
                );
            })}
            {isEditing("folder", "new", dir) && <li>{nameInput(depth)}</li>}
        </>
    );

    const sectionHeader = (title: string, actions: React.ReactNode) => (
        <div className="flex items-center gap-0.5 pl-3 pr-1 h-8 shrink-0 border-b border-border">
            <span className="truncate text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                {title}
            </span>
            <span className="ml-auto" />
            {actions}
        </div>
    );

    return (
        <div className="flex h-full flex-col overflow-hidden bg-muted/20">
            {folder ? (
                <div className="flex min-h-0 flex-[2] flex-col">
                    {sectionHeader(
                        folder.name,
                        <>
                            <IconButton
                                label="New file"
                                onClick={() =>
                                    start({ scope: "folder", mode: "file", target: selectedDir })
                                }
                            >
                                <FilePlus2 className="h-3.5 w-3.5" />
                            </IconButton>
                            <IconButton
                                label="New folder"
                                onClick={() =>
                                    start({
                                        scope: "folder",
                                        mode: "directory",
                                        target: selectedDir,
                                    })
                                }
                            >
                                <FolderPlus className="h-3.5 w-3.5" />
                            </IconButton>
                            <IconButton label="Refresh" onClick={onRefreshFolder}>
                                <RefreshCw className="h-3.5 w-3.5" />
                            </IconButton>
                            <IconButton label="Close folder" onClick={onCloseFolder}>
                                <X className="h-3.5 w-3.5" />
                            </IconButton>
                        </>,
                    )}
                    <ul
                        className="flex-1 overflow-y-auto py-1"
                        role="tree"
                        aria-label={folder.name}
                        onClick={(e) => e.target === e.currentTarget && setSelectedDir("")}
                    >
                        {tree("", 0)}
                        {!entries.length && !editing && (
                            <li className="px-3 py-2 text-xs text-muted-foreground">
                                Empty folder. Create a file with the + button.
                            </li>
                        )}
                    </ul>
                </div>
            ) : (
                canOpenFolder && (
                    <div className="space-y-2 p-3 border-b border-border">
                        <Button size="sm" className="w-full h-8 text-xs" onClick={onOpenFolder}>
                            <FolderOpen className="h-3.5 w-3.5 mr-1.5" /> Open folder
                        </Button>
                        {recentFolder && (
                            <button
                                type="button"
                                onClick={onReopenFolder}
                                className="block w-full truncate text-left text-xs text-primary hover:underline"
                            >
                                Reopen {recentFolder}
                            </button>
                        )}
                    </div>
                )
            )}

            <div className={cn("flex flex-1 min-h-0 flex-col", folder && "border-t border-border")}>
                {sectionHeader(
                    "Browser files",
                    <>
                        <IconButton
                            label="New file"
                            onClick={() => start({ scope: "browser", mode: "file", target: "" })}
                        >
                            <FilePlus2 className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton label="Open file from computer" onClick={onOpenDisk}>
                            <FileUp className="h-3.5 w-3.5" />
                        </IconButton>
                    </>,
                )}
                <ul
                    className="flex-1 overflow-y-auto py-1"
                    role="listbox"
                    aria-label="Browser files"
                >
                    {files.map((f) => {
                        const rename = () =>
                            start({ scope: "browser", mode: "rename", target: f.id }, f.name);
                        return isEditing("browser", "rename", f.id) ? (
                            <li key={f.id}>{nameInput()}</li>
                        ) : (
                            <li
                                key={f.id}
                                role="option"
                                aria-selected={f.id === activeId}
                                tabIndex={0}
                                onClick={() => onOpen(f.id)}
                                onDoubleClick={rename}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") onOpen(f.id);
                                    if (e.key === "F2") rename();
                                    if (e.key === "Delete") removeFile(f);
                                }}
                                style={{ paddingLeft: 12 }}
                                className={rowClass(f.id === activeId)}
                            >
                                <FileCode2
                                    className={cn("h-3.5 w-3.5 shrink-0", fileIconColor(f.name))}
                                />
                                <span className="truncate">{f.name}</span>
                                {diskName(f.id) && (
                                    <span
                                        title={`Auto-saves to ${diskName(f.id)} on your computer`}
                                    >
                                        <HardDrive className="h-3 w-3 shrink-0 text-primary/70" />
                                    </span>
                                )}
                                <span className="ml-auto hidden group-hover:flex group-focus-within:flex [@media(pointer:coarse)]:flex">
                                    <IconButton label={`Rename ${f.name}`} onClick={rename}>
                                        <Pencil className="h-3 w-3" />
                                    </IconButton>
                                    <IconButton
                                        label={`Delete ${f.name}`}
                                        onClick={() => removeFile(f)}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </IconButton>
                                </span>
                            </li>
                        );
                    })}
                    {isEditing("browser", "new", "") && <li>{nameInput()}</li>}
                </ul>
            </div>
        </div>
    );
};
