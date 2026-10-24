// Building blocks for the Settings screens, in the iOS / Android settings
// style: titled groups of rows on a glass card, rows with a control on the
// right, and navigation rows that lead into a section.
import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const SettingsGroup = ({
    title,
    footer,
    children,
    className,
}: {
    title?: string;
    footer?: ReactNode;
    children: ReactNode;
    className?: string;
}) => (
    <section className={className}>
        {title && (
            <h3 className="px-4 pb-2 font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {title}
            </h3>
        )}
        <div className="rounded-2xl border border-border bg-card shadow-card divide-y divide-border overflow-hidden">
            {children}
        </div>
        {footer && <div className="px-4 pt-2 text-xs text-muted-foreground">{footer}</div>}
    </section>
);

/** A row with text on the left and a control (switch, select, button) on the right. */
export const SettingsRow = ({
    title,
    description,
    icon: Icon,
    control,
    stack = false,
    children,
}: {
    title: ReactNode;
    description?: ReactNode;
    icon?: ComponentType<{ className?: string }>;
    control?: ReactNode;
    /** Put the control under the text (inputs, wide selects). */
    stack?: boolean;
    children?: ReactNode;
}) => (
    <div className="px-4 py-3.5">
        <div className={cn("flex gap-3", stack ? "flex-col" : "items-center justify-between")}>
            <div className="flex min-w-0 flex-1 items-start gap-3">
                {Icon && <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />}
                <div className="min-w-0">
                    <div className="font-medium text-[15px] leading-snug">{title}</div>
                    {description && (
                        <p className="mt-0.5 text-sm text-muted-foreground leading-snug">
                            {description}
                        </p>
                    )}
                </div>
            </div>
            {control && <div className={cn("shrink-0", stack && "w-full")}>{control}</div>}
        </div>
        {children}
    </div>
);

/** Coloured rounded-square icon, like iOS settings. */
export const SettingsIcon = ({
    icon: Icon,
    tint,
}: {
    icon: ComponentType<{ className?: string }>;
    tint: string;
}) => (
    <span
        className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-white shadow-sm",
            tint,
        )}
    >
        <Icon className="h-[18px] w-[18px]" />
    </span>
);

/** A row that opens a section. */
export const SettingsNavRow = ({
    to,
    icon,
    tint,
    title,
    subtitle,
    value,
    active = false,
    destructive = false,
    onClick,
}: {
    to?: string;
    icon: ComponentType<{ className?: string }>;
    tint: string;
    title: string;
    subtitle?: string;
    value?: ReactNode;
    active?: boolean;
    destructive?: boolean;
    onClick?: () => void;
}) => {
    const body = (
        <>
            <SettingsIcon icon={icon} tint={tint} />
            <span className="min-w-0 flex-1 text-left">
                <span
                    className={cn(
                        "block truncate text-[15px] font-medium",
                        destructive && "text-destructive",
                    )}
                >
                    {title}
                </span>
                {subtitle && (
                    <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
                )}
            </span>
            {value !== undefined && (
                <span className="shrink-0 max-w-[40%] truncate text-sm text-muted-foreground">
                    {value}
                </span>
            )}
            {to && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" />}
        </>
    );
    const cls = cn(
        "flex w-full items-center gap-3 px-4 py-3 min-h-[60px] transition-colors",
        "hover:bg-muted/50 active:bg-muted focus-visible:outline-none focus-visible:bg-muted/60",
        // Highlight the open section only where list and section sit side by side.
        active && "md:bg-primary/10 md:hover:bg-primary/10",
    );
    return to ? (
        <Link to={to} className={cls} aria-current={active ? "page" : undefined}>
            {body}
        </Link>
    ) : (
        <button type="button" onClick={onClick} className={cls}>
            {body}
        </button>
    );
};
