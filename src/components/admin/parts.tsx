// Small building blocks shared by the admin pages.
import { useEffect, useState, type ReactNode } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** A glass card with an optional title row. */
export const Panel = ({
    title,
    note,
    action,
    className,
    children,
}: {
    title?: ReactNode;
    note?: ReactNode;
    action?: ReactNode;
    className?: string;
    children: ReactNode;
}) => (
    <section
        className={cn(
            "overflow-hidden rounded-3xl border border-border bg-card shadow-card",
            className,
        )}
    >
        {title && (
            <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3.5 sm:px-5">
                <div className="min-w-0">
                    <h2 className="text-base font-semibold">{title}</h2>
                    {note && <p className="text-xs text-muted-foreground">{note}</p>}
                </div>
                {action}
            </div>
        )}
        {children}
    </section>
);

/** A headline number with its icon chip. */
export const Metric = ({
    icon: Icon,
    tint,
    label,
    value,
    sub,
}: {
    icon: LucideIcon;
    tint: string;
    label: string;
    value: ReactNode;
    sub?: ReactNode;
}) => (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-card sm:p-5">
        <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-muted-foreground">{label}</span>
            <span
                className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", tint)}
            >
                <Icon className="h-4 w-4" />
            </span>
        </div>
        <div className="mt-2 font-display text-[28px] font-semibold leading-none tracking-tight tabular-nums sm:text-4xl">
            {value}
        </div>
        {sub && <div className="mt-2 truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
);

export const EmptyState = ({
    icon: Icon,
    children,
}: {
    icon?: LucideIcon;
    children: ReactNode;
}) => (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
        {Icon && <Icon className="h-8 w-8 opacity-40" />}
        {children}
    </div>
);

export const ErrorNote = ({ children }: { children: ReactNode }) => (
    <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {children}
    </div>
);

const AVATAR_COLORS = [
    "bg-violet-500",
    "bg-indigo-500",
    "bg-blue-500",
    "bg-cyan-500",
    "bg-teal-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-rose-500",
];

/** Initial on a colour picked from the id, the same colour every time. */
export const Initial = ({
    id,
    name,
    email,
    className,
}: {
    id: string;
    name?: string | null;
    email?: string | null;
    className?: string;
}) => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % AVATAR_COLORS.length;
    const letter = (name?.trim() || email || "?").charAt(0).toUpperCase();
    return (
        <span
            aria-hidden="true"
            className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white",
                AVATAR_COLORS[h],
                className,
            )}
        >
            {letter}
        </span>
    );
};

/** A segmented control: one choice from a few, on a recessed glass track. */
export function Segmented<T extends string>({
    value,
    onChange,
    options,
    className,
}: {
    value: T;
    onChange: (v: T) => void;
    options: { value: T; label: ReactNode }[];
    className?: string;
}) {
    return (
        <div role="tablist" className={cn("glass-well inline-flex rounded-full p-1", className)}>
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="tab"
                    aria-selected={value === o.value}
                    onClick={() => onChange(o.value)}
                    className={cn(
                        "flex h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        value === o.value
                            ? "glass-lens text-primary"
                            : "text-muted-foreground hover:text-foreground",
                    )}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

export type Field = {
    name: string;
    label: string;
    placeholder?: string;
    type?: "text" | "number" | "textarea";
    required?: boolean;
};

/**
 * A dialog that asks for a few values, replacing window.prompt. `onSubmit`
 * runs on confirm; Cancel or closing it does nothing.
 */
export const FormDialog = ({
    open,
    onOpenChange,
    title,
    description,
    fields,
    confirmLabel,
    destructive,
    onSubmit,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: ReactNode;
    fields: Field[];
    confirmLabel: string;
    destructive?: boolean;
    onSubmit: (values: Record<string, string>) => Promise<boolean | void>;
}) => {
    const [values, setValues] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (open) setValues({});
    }, [open]);

    const missing = fields.some((f) => f.required && !values[f.name]?.trim());
    const submit = async () => {
        if (missing || busy) return;
        setBusy(true);
        const ok = await onSubmit(values);
        setBusy(false);
        if (ok !== false) onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
            <DialogContent className="w-[calc(100%-2rem)] rounded-3xl sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    {description && <DialogDescription>{description}</DialogDescription>}
                </DialogHeader>
                <form
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void submit();
                    }}
                >
                    {fields.map((f, i) => (
                        <div key={f.name} className="space-y-1.5">
                            <Label htmlFor={`fd-${f.name}`}>
                                {f.label}
                                {!f.required && (
                                    <span className="font-normal text-muted-foreground">
                                        {" "}
                                        (optional)
                                    </span>
                                )}
                            </Label>
                            {f.type === "textarea" ? (
                                <Textarea
                                    id={`fd-${f.name}`}
                                    rows={3}
                                    autoFocus={i === 0}
                                    placeholder={f.placeholder}
                                    value={values[f.name] ?? ""}
                                    onChange={(e) =>
                                        setValues((v) => ({ ...v, [f.name]: e.target.value }))
                                    }
                                />
                            ) : (
                                <Input
                                    id={`fd-${f.name}`}
                                    type={f.type === "number" ? "number" : "text"}
                                    inputMode={f.type === "number" ? "numeric" : undefined}
                                    autoFocus={i === 0}
                                    placeholder={f.placeholder}
                                    value={values[f.name] ?? ""}
                                    onChange={(e) =>
                                        setValues((v) => ({ ...v, [f.name]: e.target.value }))
                                    }
                                />
                            )}
                        </div>
                    ))}
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                            disabled={busy}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant={destructive ? "destructive" : "default"}
                            disabled={missing || busy}
                        >
                            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {confirmLabel}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
