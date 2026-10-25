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
import { useMyProfile } from "@/hooks/useMyProfile";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useAdminPaymentAlerts } from "@/hooks/useAdminPaymentAlerts";
import { OfflineBanner } from "./OfflineBanner";
import {
    CodeIcon,
    CoursesIcon,
    GrowthIcon,
    HomeIcon,
    MenuIcon,
    SettingsIcon,
    ShieldIcon,
    WalletIcon,
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
    "/payments": WalletIcon,
    "/admin": ShieldIcon,
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

    const { avatarUrl, name: displayName } = useMyProfile(user);
    // A broken photo URL falls back to the initial.
    const [avatarFailed, setAvatarFailed] = useState(false);
    useEffect(() => setAvatarFailed(false), [avatarUrl]);

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
            {/* Phones: a full-width bar. md and up: a floating glass capsule. */}
            <header className="sticky top-0 z-40 select-none pt-[env(safe-area-inset-top)] md:px-4 md:pt-3">
                <div className="glass-bar glass-capsule border-b md:mx-auto md:max-w-6xl md:rounded-full md:border">
                    <div className="container flex h-14 items-center gap-3 md:max-w-none md:pl-5 md:pr-2">
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

                        {/* Desktop nav: the active tab always shows its label; the
                            rest add theirs once there's room (lg). */}
                        {user ? (
                            <nav
                                aria-label="Primary"
                                className="hidden md:flex flex-1 min-w-0 justify-center"
                            >
                                <div className="glass-well flex items-center gap-0.5 rounded-full p-1">
                                    {navItems.map((n) => {
                                        const Icon = TAB_ICONS[n.to] ?? HomeIcon;
                                        return (
                                            <NavLink
                                                key={n.to}
                                                to={n.to}
                                                title={n.label}
                                                className={({ isActive }) =>
                                                    cn(
                                                        "flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium transition-[color,background-color,box-shadow] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:px-3.5",
                                                        isActive
                                                            ? "glass-lens text-primary"
                                                            : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                                                        n.to === "/admin" &&
                                                            !isActive &&
                                                            "text-amber-500 hover:text-amber-400",
                                                    )
                                                }
                                            >
                                                {({ isActive }) => (
                                                    <>
                                                        <Icon
                                                            active={isActive}
                                                            className="h-[18px] w-[18px] shrink-0"
                                                        />
                                                        <span
                                                            className={cn(
                                                                "whitespace-nowrap",
                                                                !isActive &&
                                                                    "sr-only lg:not-sr-only",
                                                            )}
                                                        >
                                                            {n.label}
                                                        </span>
                                                    </>
                                                )}
                                            </NavLink>
                                        );
                                    })}
                                </div>
                            </nav>
                        ) : null}

                        {/* Spacer (the desktop nav fills this role when signed in) */}
                        <div className={cn("flex-1", user && "md:hidden")} />

                        {/* Desktop right actions */}
                        <div className="hidden md:flex shrink-0 items-center gap-2">
                            {/* <LanguageToggle /> */}
                            <div className="glass-well flex items-center gap-0.5 rounded-full p-1 [&_button]:h-9 [&_button]:w-9 [&_button]:rounded-full [&_button:hover]:bg-foreground/5">
                                <ThemeToggle />
                                {user && (
                                    <Suspense fallback={null}>
                                        <NotificationCenter />
                                    </Suspense>
                                )}
                            </div>
                            {user ? (
                                <>
                                    {/* Upgrade CTA */}
                                    <Link
                                        to="/buy"
                                        aria-label="Upgrade"
                                        className="flex h-9 w-9 items-center justify-center gap-1.5 rounded-full bg-gradient-lime text-sm font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-[1.03] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:w-auto lg:px-4"
                                    >
                                        <Sparkles className="h-4 w-4" />
                                        <span className="hidden lg:inline">Upgrade</span>
                                    </Link>

                                    {/* Avatar / profile */}
                                    <button
                                        onClick={() => navigate("/settings")}
                                        aria-label="Settings"
                                        className="flex h-9 w-9 items-center justify-center rounded-full overflow-hidden ring-2 ring-[var(--glass-border)] transition-all hover:ring-primary focus-visible:outline-none focus-visible:ring-ring"
                                    >
                                        {avatarUrl && !avatarFailed ? (
                                            <img
                                                src={avatarUrl}
                                                alt=""
                                                referrerPolicy="no-referrer"
                                                onError={() => setAvatarFailed(true)}
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
                                        className="h-9 w-9 rounded-full text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
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
                                <Button
                                    size="sm"
                                    className="h-9 rounded-full px-4"
                                    onClick={() => navigate("/auth")}
                                >
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
                </div>
                <OfflineBanner />
            </header>

            <MobileMenu
                open={mobileOpen}
                onOpenChange={setMobileOpen}
                user={user}
                displayName={displayName}
                avatarUrl={avatarFailed ? undefined : avatarUrl}
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
