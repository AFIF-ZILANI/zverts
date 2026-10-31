import { useRef, useState } from "react";
import { FileCode2, FilePlus2, FolderOpen, HardDrive, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { validName, type IdeFile } from "./files";

type Editing = { id: string | null; value: string; error: string | null };

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
        className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
    >
        {children}
    </button>
);

/** VS Code-style file list: new, open from disk, rename (double-click / F2), delete. */
export const FileExplorer = ({
    files,
    activeId,
    diskName,
    onOpen,
    onCreate,
    onRename,
    onDelete,
    onOpenDisk,
}: {
    files: IdeFile[];
    activeId: string | null;
    diskName: (id: string) => string | null;
    onOpen: (id: string) => void;
    onCreate: (name: string) => void;
    onRename: (id: string, name: string) => void;
    onDelete: (id: string) => void;
    onOpenDisk: () => void;
}) => {
    // id null = a new file being named.
    const [editing, setEditing] = useState<Editing | false>(false);
    const cancelled = useRef(false);

    const commit = () => {
        if (!editing) return;
        const self = editing.id ?? undefined;
        const unchanged = self && files.find((f) => f.id === self)?.name === editing.value.trim();
        if (unchanged || (!self && !editing.value.trim())) return setEditing(false);
        const error = validName(editing.value, files, self);
        if (error) return setEditing({ ...editing, error });
        if (self) onRename(self, editing.value);
        else onCreate(editing.value);
        setEditing(false);
    };

    const remove = (f: IdeFile) => {
        if (window.confirm(`Delete ${f.name}? This can't be undone.`)) onDelete(f.id);
    };

    const nameInput = (
        <div className="px-2 py-1">
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
                placeholder="name.cpp"
                spellCheck={false}
                aria-label="File name"
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

    return (
        <div className="flex h-full flex-col bg-muted/20">
            <div className="flex items-center gap-0.5 pl-3 pr-1 h-9 shrink-0 border-b border-border">
                <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                    Explorer
                </span>
                <span className="ml-auto" />
                <IconButton
                    label="New file"
                    onClick={() => setEditing({ id: null, value: "", error: null })}
                >
                    <FilePlus2 className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label="Open file from computer" onClick={onOpenDisk}>
                    <FolderOpen className="h-3.5 w-3.5" />
                </IconButton>
            </div>
            <ul className="flex-1 overflow-y-auto py-1" role="listbox" aria-label="Files">
                {files.map((f) =>
                    editing && editing.id === f.id ? (
                        <li key={f.id}>{nameInput}</li>
                    ) : (
                        <li
                            key={f.id}
                            role="option"
                            aria-selected={f.id === activeId}
                            tabIndex={0}
                            onClick={() => onOpen(f.id)}
                            onDoubleClick={() =>
                                setEditing({ id: f.id, value: f.name, error: null })
                            }
                            onKeyDown={(e) => {
                                if (e.key === "Enter") onOpen(f.id);
                                if (e.key === "F2")
                                    setEditing({ id: f.id, value: f.name, error: null });
                                if (e.key === "Delete") remove(f);
                            }}
                            className={cn(
                                "group flex items-center gap-1.5 pl-3 pr-1 h-7 cursor-pointer font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                f.id === activeId
                                    ? "bg-primary/10 text-foreground"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                        >
                            <FileCode2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                            <span className="truncate">{f.name}</span>
                            {diskName(f.id) && (
                                <span title={`Auto-saves to ${diskName(f.id)} on your computer`}>
                                    <HardDrive className="h-3 w-3 shrink-0 text-primary/70" />
                                </span>
                            )}
                            <span className="ml-auto hidden group-hover:flex group-focus-within:flex">
                                <IconButton
                                    label={`Rename ${f.name}`}
                                    onClick={() =>
                                        setEditing({ id: f.id, value: f.name, error: null })
                                    }
                                >
                                    <Pencil className="h-3 w-3" />
                                </IconButton>
                                <IconButton label={`Delete ${f.name}`} onClick={() => remove(f)}>
                                    <Trash2 className="h-3 w-3" />
                                </IconButton>
                            </span>
                        </li>
                    ),
                )}
                {editing && editing.id === null && <li>{nameInput}</li>}
            </ul>
        </div>
    );
};
