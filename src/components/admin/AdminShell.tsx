// Frame shared by every admin page: the section navigation (a side rail on
// laptops, a swipeable pill row on phones and tablets) and the page header.
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
    LayoutGrid,
    Megaphone,
    Phone,
    ShieldCheck,
    Sparkles,
    Users,
    Wallet,
    type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useEntitlements } from "@/hooks/useEntitlements";
import { cn } from "@/lib/utils";

type Item = { to: string; label: string; icon: LucideIcon; count?: number; end?: boolean };

/** Pending payments, for the badge on the Payments item. */
const usePendingCount = () => {
    const [count, setCount] = useState(0);
    const { pathname } = useLocation();
    useEffect(() => {
        let cancelled = false;
        supabase
            .from("payments")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending")
            .then(({ count }) => !cancelled && setCount(count ?? 0));
        return () => {
            cancelled = true;
        };
    }, [pathname]);
    return count;
};

export const AdminShell = ({
    title,
    description,
    actions,
    children,
}: {
    title: string;
    description?: ReactNode;
    /** Buttons on the right of the title (below it on phones). */
    actions?: ReactNode;
    children: ReactNode;
}) => {
    const { isSuperAdmin } = useEntitlements();
    const pending = usePendingCount();

    const items: Item[] = [
        { to: "/admin", label: "Overview", icon: LayoutGrid, end: true },
        { to: "/admin/impact", label: "Impact", icon: Sparkles },
        { to: "/admin/payments", label: "Payments", icon: Wallet, count: pending },
        { to: "/admin/users", label: "Users", icon: Users },
        { to: "/admin/support-contacts", label: "Support", icon: Phone },
        { to: "/admin/broadcast", label: "Broadcast", icon: Megaphone },
        ...(isSuperAdmin ? [{ to: "/admin/management", label: "Admins", icon: ShieldCheck }] : []),
    ];

    return (
        <AppShell>
            <div className="container max-w-7xl py-5 md:py-8 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-8">
                {/* Laptops and up: a side rail that stays in view. */}
                <aside className="sticky top-[calc(var(--app-header-h)+1rem)] hidden lg:block">
                    <div className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Admin
                    </div>
                    <nav aria-label="Admin" className="flex flex-col gap-0.5">
                        {items.map((it) => (
                            <NavLink
                                key={it.to}
                                to={it.to}
                                end={it.end}
                                className={({ isActive }) =>
                                    cn(
                                        "flex h-10 items-center gap-2.5 rounded-2xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        isActive
                                            ? "glass-lens text-primary"
                                            : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                                    )
                                }
                            >
                                <it.icon className="h-4 w-4 shrink-0" />
                                <span className="flex-1 truncate">{it.label}</span>
                                {!!it.count && <CountBadge n={it.count} />}
                            </NavLink>
                        ))}
                    </nav>
                </aside>

                <div className="min-w-0">
                    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
                        <div className="min-w-0">
                            <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight md:text-4xl">
                                {title}
                            </h1>
                            {description && (
                                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                                    {description}
                                </p>
                            )}
                        </div>
                        {actions && (
                            <div className="flex flex-wrap items-center gap-2">{actions}</div>
                        )}
                    </header>

                    {/* Phones and tablets: the sections as a swipeable row. */}
                    <nav
                        aria-label="Admin"
                        className="-mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-none lg:hidden"
                    >
                        {items.map((it) => (
                            <NavLink
                                key={it.to}
                                to={it.to}
                                end={it.end}
                                className={({ isActive }) =>
                                    cn(
                                        "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                                        isActive
                                            ? "glass-lens border-transparent text-primary"
                                            : "border-border bg-card text-muted-foreground hover:text-foreground",
                                    )
                                }
                            >
                                <it.icon className="h-4 w-4" />
                                {it.label}
                                {!!it.count && <CountBadge n={it.count} />}
                            </NavLink>
                        ))}
                    </nav>

                    <div className="mt-5 space-y-5 md:mt-6">{children}</div>
                </div>
            </div>
        </AppShell>
    );
};

const CountBadge = ({ n }: { n: number }) => (
    <span className="min-w-5 rounded-full bg-amber-500 px-1.5 text-center text-[11px] font-semibold leading-5 text-white tabular-nums">
        {n > 99 ? "99+" : n}
    </span>
);
