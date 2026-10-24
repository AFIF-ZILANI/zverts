import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

/** App-style section heading: a title, an optional note and a "See all" link. */
export const SectionTitle = ({
    title,
    note,
    to,
    action = "See all",
}: {
    title: string;
    note?: ReactNode;
    to?: string;
    action?: string;
}) => (
    <div className="mb-3 flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            {note && <p className="text-xs text-muted-foreground">{note}</p>}
        </div>
        {to && (
            <Link
                to={to}
                className="-mr-1 inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-sm font-medium text-primary hover:bg-primary/10"
            >
                {action} <ChevronRight className="h-4 w-4" />
            </Link>
        )}
    </div>
);
