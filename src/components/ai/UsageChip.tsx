import { Sparkles, Infinity as InfIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { UsageState } from "@/hooks/useAIUsage";

export const UsageChip = ({ usage }: { usage: UsageState | null }) => {
    if (!usage) return null;
    if (usage.paid) {
        return (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <InfIcon className="h-3.5 w-3.5" /> Unlimited
            </div>
        );
    }
    const low = (usage.remaining ?? 0) <= 2;
    const out = (usage.remaining ?? 0) <= 0;
    return (
        <Link
            to={out ? "/buy" : "#"}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                out
                    ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
                    : low
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "border-border/60 bg-background/60 text-muted-foreground hover:text-foreground",
            )}
        >
            <Sparkles className="h-3.5 w-3.5" />
            {out ? "Upgrade for more" : `${usage.count} / ${usage.limit} today`}
        </Link>
    );
};
