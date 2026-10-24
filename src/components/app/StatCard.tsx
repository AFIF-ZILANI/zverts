import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const StatCard = ({
    icon: Icon,
    label,
    value,
    sub,
    tint = "bg-primary/15 text-primary",
}: {
    icon: LucideIcon;
    label: string;
    value: ReactNode;
    sub?: string;
    /** Background and text colour of the icon chip. */
    tint?: string;
}) => (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-muted-foreground">{label}</span>
            <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl", tint)}>
                <Icon className="h-4 w-4" />
            </span>
        </div>
        <div className="mt-2 font-display text-[28px] leading-none font-semibold tracking-tight tabular-nums">
            {value}
        </div>
        {sub && <div className="mt-1.5 truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
);
