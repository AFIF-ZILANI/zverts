import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
    LogOut,
    LayoutDashboard,
    BookOpen,
    Shield,
    Sparkles,
    TrendingUp,
    CreditCard,
    Settings,
    Code2,
} from "lucide-react";
import { ReactNode, Suspense, lazy, useEffect, useRef, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useAdminPaymentAlerts } from "@/hooks/useAdminPaymentAlerts";
import { useBrowserNotifications } from "@/hooks/useBrowserNotifications";
import { OfflineBanner } from "./OfflineBanner";
import {
    CodeIcon,
    CoursesIcon,
    GrowthIcon,
    HomeIcon,
    MenuIcon,
    SettingsIcon,
    type TabIcon,
} from "./TabIcons";
import { MobileMenu } from "./MobileMenu";
import { useHideOnScroll } from "@/hooks/useHideOnScroll";

const TAB_ICONS: Record<string, TabIcon> = {
    "/dashboard": HomeIcon,
    "/courses": CoursesIcon,
    "/code": CodeIcon,
    "/growth": GrowthIcon,
    "/settings": SettingsIcon,
};

// One phone tab: the active one sits on a tinted glass pill and its icon switches to
// the filled variant.
const TabContent = ({
    label,
    on,
    children,
}: {
    label: string;
    on: boolean;
    children: ReactNode;
}) => (
    <>
        <span
            aria-hidden="true"
            className={cn(
                "absolute inset-x-0.5 inset-y-1.5 rounded-[22px] bg-primary/12 ring-1 ring-inset ring-primary/15 transition-all duration-300",
                on ? "opacity-100 scale-100" : "opacity-0 scale-90",
            )}
        />
        <span
            className={cn(
                "relative transition-colors",
                on ? "text-primary" : "text-muted-foreground",
            )}
        >
            {children}
        </span>
        <span
            className={cn(
                "relative truncate max-w-full px-1 text-[11px] leading-none transition-colors",
                on ? "text-primary font-semibold" : "text-muted-foreground font-medium",
            )}
        >
            {label}
        </span>
    </>
);

const SiteFooter = lazy(() => import("./SiteFooter").then((m) => ({ default: m.SiteFooter })));
const NotificationCenter = lazy(() =>
    import("./NotificationCenter").then((m) => ({ default: m.NotificationCenter })),
);
const InstallPrompt = lazy(() =>
    import("./InstallPrompt").then((m) => ({ default: m.InstallPrompt })),
);
const SupportContactPopup = lazy(() =>
    import("./SupportContactPopup").then((m) => ({ default: m.SupportContactPopup })),
);

export const AppShell = ({ children }: { children: ReactNode }) => {
    const { user, signOut } = useAuth();
    const { isAdmin, convert_credits } = useEntitlements();
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation();
    const { theme } = useTheme();
    const [mobileOpen, setMobileOpen] = useState(false);
    // Phones: the tab bar slides away while scrolling down, back on scroll up.
    const tabBarRef = useHideOnScroll<HTMLElement>(!!user && !mobileOpen, location.pathname);
    const attendanceMarkedFor = useRef<string | null>(null);

    // Mark today's attendance once per user per browser session.
    // The RPC is idempotent (ON CONFLICT DO NOTHING) so calling it every
    // app load is safe — it won't create duplicate rows or reset the streak.
    useEffect(() => {
        if (!user || attendanceMarkedFor.current === user.id) return;
        attendanceMarkedFor.current = user.id;
        supabase.rpc("mark_attendance").then(({ error }) => {
            if (error) console.error("mark_attendance failed:", error.message);
        });
    }, [user]);

    useEffect(() => {
        setMobileOpen(false);
    }, [location.pathname]);

    useAdminPaymentAlerts(isAdmin);
    useBrowserNotifications();

    // Signed-in users get a bottom tab bar on phones. The attribute lets global
    // CSS reserve space for it (--app-bottom-inset) so toasts and floating
    // buttons sit above it.
    useEffect(() => {
        if (!user) return;
        document.body.setAttribute("data-bottom-nav", "");
        return () => document.body.removeAttribute("data-bottom-nav");
    }, [user]);

    // Restore scroll on route change (PWA safety)
    useEffect(() => {
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.documentElement.style.overflow = "";
        document.body.removeAttribute("data-scroll-locked");
    }, [location.pathname]);

    const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
    const displayName =
        (user?.user_metadata?.full_name as string | undefined) ??
        (user?.user_metadata?.name as string | undefined) ??
        user?.email?.split("@")[0] ??
        "You";

    // Core nav items (no Upgrade — that's a CTA button)
    const navItems = [
        { to: "/dashboard", icon: LayoutDashboard, label: t("nav.dashboard") },
        { to: "/courses", icon: BookOpen, label: t("nav.courses") },
        { to: "/code", icon: Code2, label: "Code" },
        { to: "/growth", icon: TrendingUp, label: "Growth" },
        { to: "/payments", icon: CreditCard, label: "Payments" },
        ...(isAdmin ? [{ to: "/admin", icon: Shield, label: "Admin" }] : []),
    ];
    // Phone tab bar: four places + Settings; everything else is in the menu
    // (header, next to notifications).
    const tabItems = [
        ...navItems.filter((n) => n.to !== "/admin" && n.to !== "/payments"),
        { to: "/settings", icon: Settings, label: "Settings" },
    ];

    return (
        <div
            className={cn(
                "min-h-screen flex flex-col pb-[var(--app-bottom-inset)] md:pb-0",
                theme !== "dark" &&
                    "bg-[radial-gradient(ellipse_at_top,_hsl(142_71%_45%_/_0.06),_transparent_60%)]",
            )}
        >
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <header className="glass-bar sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)] select-none">
                <div className="container flex h-14 items-center gap-3">
                    {/* Logo */}
                    <Link
                        to={user ? "/dashboard" : "/"}
                        className="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                    >
                        <img
                            src={theme === "dark" ? "/hero-light.svg" : "/hero-dark.svg"}
                            alt="ZverTs"
                            className="h-8 w-auto object-contain"
                            loading="eager"
                            decoding="async"
                        />
                    </Link>

                    {/* Desktop nav — icons only until there's room for labels */}
                    {user ? (
                        <nav className="hidden md:flex flex-1 min-w-0 justify-center items-center gap-0.5">
                            {navItems.map((n) => (
                                <NavLink
                                    key={n.to}
                                    to={n.to}
                                    title={n.label}
                                    aria-label={n.label}
                                    className={({ isActive }) =>
                                        cn(
                                            "relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                                            isActive
                                                ? "text-primary bg-primary/8"
                                                : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                                            n.to === "/admin" &&
                                                "text-amber-500 hover:text-amber-400",
                                        )
                                    }
                                >
                                    {({ isActive }) => (
                                        <>
                                            <n.icon className="h-4 w-4 lg:h-3.5 lg:w-3.5 shrink-0" />
                                            <span className="hidden lg:inline">{n.label}</span>
                                            {isActive && (
                                                <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-primary" />
                                            )}
                                        </>
                                    )}
                                </NavLink>
                            ))}
                        </nav>
                    ) : null}

                    {/* Spacer (the desktop nav fills this role when signed in) */}
                    <div className={cn("flex-1", user && "md:hidden")} />

                    {/* Desktop right actions */}
                    <div className="hidden md:flex shrink-0 items-center gap-2 lg:gap-4">
                        {/* <LanguageToggle /> */}
                        <ThemeToggle />
                        {user ? (
                            <>
                                <Suspense fallback={null}>
                                    <NotificationCenter />
                                </Suspense>

                                {/* Upgrade CTA */}
                                <Link to="/buy">
                                    <Button
                                        size="sm"
                                        aria-label="Upgrade"
                                        className="bg-gradient-lime text-primary-foreground shadow-glow ml-1 gap-1.5"
                                    >
                                        <Sparkles className="h-3.5 w-3.5" />
                                        <span className="hidden lg:inline">Upgrade</span>
                                    </Button>
                                </Link>

                                {/* Avatar / profile */}
                                <button
                                    onClick={() => navigate("/settings")}
                                    aria-label="Settings"
                                    className="ml-1 flex items-center justify-center h-8 w-8 rounded-full overflow-hidden ring-1 ring-border hover:ring-primary transition-all"
                                >
                                    {avatarUrl ? (
                                        <img
                                            src={avatarUrl}
                                            alt=""
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                                            {displayName.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                </button>

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                    onClick={async () => {
                                        await signOut();
                                        navigate("/");
                                    }}
                                    aria-label="Sign out"
                                >
                                    <LogOut className="h-4 w-4" />
                                </Button>
                            </>
                        ) : (
                            <Button size="sm" onClick={() => navigate("/auth")}>
                                {t("nav.signin")}
                            </Button>
                        )}
                    </div>

                    {/* Phones: notifications + menu */}
                    <div className="flex items-center gap-1.5 md:hidden">
                        {user && (
                            <Suspense fallback={null}>
                                <NotificationCenter />
                            </Suspense>
                        )}
                        <button
                            type="button"
                            onClick={() => setMobileOpen(true)}
                            aria-label="Open menu"
                            aria-expanded={mobileOpen}
                            className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted active:scale-95"
                        >
                            <MenuIcon className="h-6 w-6" />
                        </button>
                    </div>
                </div>
                <OfflineBanner />
            </header>

            <MobileMenu
                open={mobileOpen}
                onOpenChange={setMobileOpen}
                user={user}
                displayName={displayName}
                avatarUrl={avatarUrl}
                isAdmin={isAdmin}
                credits={convert_credits}
                onSignOut={async () => {
                    await signOut();
                    navigate("/");
                }}
            />

            <main className="flex-1">{children}</main>

            {/* ── Mobile bottom tab bar ──────────────────────────────────────── */}
            {user && (
                <nav
                    ref={tabBarRef}
                    aria-label="Primary"
                    className="glass-bar md:hidden fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 rounded-[28px] border shadow-elevated select-none will-change-transform"
                >
                    <div className="grid h-16 grid-cols-5 px-1.5">
                        {tabItems.map((n) => {
                            const Icon = TAB_ICONS[n.to] ?? HomeIcon;
                            return (
                                <NavLink
                                    key={n.to}
                                    to={n.to}
                                    onClick={() => setMobileOpen(false)}
                                    className="relative flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform"
                                >
                                    {({ isActive }) => {
                                        const on = isActive && !mobileOpen;
                                        return (
                                            <TabContent label={n.label} on={on}>
                                                <Icon active={on} />
                                            </TabContent>
                                        );
                                    }}
                                </NavLink>
                            );
                        })}
                    </div>
                </nav>
            )}
            <Suspense fallback={null}>
                <SiteFooter />
            </Suspense>
            <Suspense fallback={null}>
                <InstallPrompt />
            </Suspense>
            {user && (
                <Suspense fallback={null}>
                    <SupportContactPopup />
                </Suspense>
            )}
        </div>
    );
};
