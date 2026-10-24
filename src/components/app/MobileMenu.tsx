// The phone menu: a sheet from the right with the profile card, the places
// that don't fit the tab bar, appearance and sign-out.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import type { User } from "@supabase/supabase-js";
import {
    BookOpen,
    Code2,
    Coins,
    CreditCard,
    Flame,
    HelpCircle,
    Info,
    LayoutDashboard,
    LogIn,
    LogOut,
    Moon,
    Pencil,
    Settings as SettingsGear,
    Shield,
    Sparkles,
    Star,
    TrendingUp,
    Trophy,
    X,
    Zap,
} from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { SettingsGroup, SettingsNavRow, SettingsRow } from "@/components/app/settings/SettingsUI";
import { cn } from "@/lib/utils";

type Stats = { total_xp: number; current_streak: number; total_gems: number };

export const MobileMenu = ({
    open,
    onOpenChange,
    user,
    displayName,
    avatarUrl,
    isAdmin,
    credits,
    onSignOut,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: User | null;
    displayName: string;
    avatarUrl?: string;
    isAdmin: boolean;
    credits: number;
    onSignOut: () => void;
}) => {
    const navigate = useNavigate();
    const { resolvedTheme, setTheme } = useTheme();
    const [stats, setStats] = useState<Stats | null>(null);

    // Fresh numbers each time the menu opens.
    useEffect(() => {
        if (!open || !user) return;
        supabase
            .from("user_progress")
            .select("total_xp,current_streak,total_gems")
            .eq("user_id", user.id)
            .maybeSingle()
            .then(({ data }) => data && setStats(data));
    }, [open, user]);

    const close = () => onOpenChange(false);
    const level = Math.floor((stats?.total_xp ?? 0) / 500) + 1;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className="glass-bar w-[88vw] max-w-sm p-0 border-l overflow-y-auto overscroll-contain [&>button.absolute]:hidden"
            >
                <div className="flex min-h-full flex-col gap-5 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
                    <div className="flex items-center justify-between">
                        <SheetTitle className="font-display text-2xl">Menu</SheetTitle>
                        <SheetClose
                            aria-label="Close menu"
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/60 text-foreground hover:bg-muted"
                        >
                            <X className="h-4 w-4" />
                        </SheetClose>
                    </div>

                    {user ? (
                        <ProfileCard
                            displayName={displayName}
                            email={user.email}
                            avatarUrl={avatarUrl}
                            isAdmin={isAdmin}
                            stats={[
                                {
                                    icon: Flame,
                                    label: "Streak",
                                    value: stats?.current_streak ?? "–",
                                    tint: "text-orange-500",
                                },
                                {
                                    icon: Zap,
                                    label: "XP",
                                    value: stats ? stats.total_xp.toLocaleString() : "–",
                                    tint: "text-yellow-500",
                                },
                                {
                                    icon: Star,
                                    label: "Level",
                                    value: stats ? level : "–",
                                    tint: "text-primary",
                                },
                                {
                                    icon: Coins,
                                    label: "Credits",
                                    value: credits,
                                    tint: "text-sky-500",
                                },
                            ]}
                            onNavigate={close}
                        />
                    ) : (
                        <div className="rounded-3xl border border-border bg-card p-5 shadow-card text-center">
                            <p className="font-display text-xl">Welcome to ZverTs</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Sign in to track progress, streaks and certificates.
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    close();
                                    navigate("/auth");
                                }}
                                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-lime text-sm font-semibold text-primary-foreground shadow-glow"
                            >
                                <LogIn className="h-4 w-4" /> Sign in
                            </button>
                        </div>
                    )}

                    {user && (
                        <Link
                            to="/buy"
                            onClick={close}
                            className="flex items-center gap-3 rounded-2xl bg-gradient-lime px-4 py-3 text-primary-foreground shadow-glow active:scale-[0.99] transition-transform"
                        >
                            <Sparkles className="h-5 w-5 shrink-0" />
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold">Upgrade to Pro</span>
                                <span className="block text-xs opacity-80">
                                    Unlock more playlist credits
                                </span>
                            </span>
                        </Link>
                    )}

                    {user && (
                        <SettingsGroup title="Learn">
                            <MenuRow
                                to="/dashboard"
                                icon={LayoutDashboard}
                                tint="bg-sky-500"
                                title="Dashboard"
                                onNavigate={close}
                            />
                            <MenuRow
                                to="/courses"
                                icon={BookOpen}
                                tint="bg-emerald-500"
                                title="Courses"
                                onNavigate={close}
                            />
                            <MenuRow
                                to="/code"
                                icon={Code2}
                                tint="bg-violet-500"
                                title="Code Playground"
                                onNavigate={close}
                            />
                            <MenuRow
                                to="/growth"
                                icon={TrendingUp}
                                tint="bg-amber-500"
                                title="Growth"
                                onNavigate={close}
                            />
                            <MenuRow
                                to="/leaderboard"
                                icon={Trophy}
                                tint="bg-orange-500"
                                title="Leaderboard"
                                onNavigate={close}
                            />
                        </SettingsGroup>
                    )}

                    {user && (
                        <SettingsGroup title="Account">
                            <MenuRow
                                to="/payments"
                                icon={CreditCard}
                                tint="bg-indigo-500"
                                title="Payments"
                                onNavigate={close}
                            />
                            <MenuRow
                                to="/settings"
                                icon={SettingsGear}
                                tint="bg-slate-500"
                                title="Settings"
                                onNavigate={close}
                            />
                            {isAdmin && (
                                <MenuRow
                                    to="/admin"
                                    icon={Shield}
                                    tint="bg-amber-600"
                                    title="Admin"
                                    onNavigate={close}
                                />
                            )}
                        </SettingsGroup>
                    )}

                    <SettingsGroup title="Help">
                        <MenuRow
                            to="/info/help"
                            icon={HelpCircle}
                            tint="bg-teal-600"
                            title="Help Center"
                            onNavigate={close}
                        />
                        <MenuRow
                            to="/info/about"
                            icon={Info}
                            tint="bg-zinc-500"
                            title="About ZverTs"
                            onNavigate={close}
                        />
                    </SettingsGroup>

                    <SettingsGroup>
                        <SettingsRow
                            icon={Moon}
                            title="Dark mode"
                            control={
                                <Switch
                                    checked={resolvedTheme === "dark"}
                                    onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
                                    aria-label="Dark mode"
                                />
                            }
                        />
                    </SettingsGroup>

                    {user && (
                        <SettingsGroup>
                            <SettingsNavRow
                                icon={LogOut}
                                tint="bg-destructive"
                                title="Sign out"
                                destructive
                                onClick={() => {
                                    close();
                                    onSignOut();
                                }}
                            />
                        </SettingsGroup>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
};

const MenuRow = ({
    onNavigate,
    ...row
}: Parameters<typeof SettingsNavRow>[0] & { onNavigate: () => void }) => (
    // Closing happens on route change too; this also covers tapping the current page.
    <div onClickCapture={onNavigate}>
        <SettingsNavRow {...row} />
    </div>
);

const ProfileCard = ({
    displayName,
    email,
    avatarUrl,
    isAdmin,
    stats,
    onNavigate,
}: {
    displayName: string;
    email?: string;
    avatarUrl?: string;
    isAdmin: boolean;
    stats: { icon: typeof Flame; label: string; value: string | number; tint: string }[];
    onNavigate: () => void;
}) => (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
        {/* Cover: the same ZverTs banner for every account. */}
        <img
            src="/profile-banner.webp"
            alt=""
            className="block aspect-[1500/420] w-full bg-[#0c0f0e] object-cover"
        />
        <div className="-mt-10 px-4 pb-4">
            <div className="flex items-end justify-between gap-3">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full ring-4 ring-background bg-gradient-lime flex items-center justify-center font-display text-3xl text-primary-foreground">
                    {avatarUrl ? (
                        <img
                            src={avatarUrl}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                        />
                    ) : (
                        displayName.charAt(0).toUpperCase()
                    )}
                </div>
                <Link
                    to="/settings/account"
                    onClick={onNavigate}
                    className="mb-1 inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background/70 px-3 text-xs font-medium hover:bg-muted"
                >
                    <Pencil className="h-3 w-3" /> Edit
                </Link>
            </div>

            <div className="mt-3 flex items-center gap-2">
                <p className="truncate font-display text-xl leading-tight">{displayName}</p>
                {isAdmin && (
                    <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-500">
                        Admin
                    </span>
                )}
            </div>
            {email && <p className="truncate text-sm text-muted-foreground">{email}</p>}

            <div className="mt-4 grid grid-cols-4 divide-x divide-border rounded-2xl bg-muted/40">
                {stats.map((s) => (
                    <div key={s.label} className="flex flex-col items-center gap-0.5 px-1 py-2.5">
                        <s.icon className={cn("h-4 w-4", s.tint)} />
                        <span className="text-sm font-semibold tabular-nums">{s.value}</span>
                        <span className="text-[10px] text-muted-foreground">{s.label}</span>
                    </div>
                ))}
            </div>

            <Link
                to="/profile"
                onClick={onNavigate}
                className="mt-3 flex h-10 items-center justify-center rounded-xl border border-border bg-background/60 text-sm font-semibold hover:bg-muted"
            >
                View profile
            </Link>
        </div>
    </div>
);
