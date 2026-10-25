// The bell in the header and its panel: today's and earlier notifications,
// an Unread filter, and a prompt to turn on push for this device.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import {
    AlertCircle,
    AlertTriangle,
    Award,
    Bell,
    BellRing,
    BookOpen,
    Brain,
    CheckCheck,
    CheckCircle2,
    Clock,
    CloudSun,
    Flame,
    HelpCircle,
    ListVideo,
    Loader2,
    Moon,
    Rocket,
    Settings,
    Sparkles,
    Sun,
    Sunset,
    Target,
    Trophy,
    Unlock,
    Wallet,
    X,
    type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { useAuth } from "@/hooks/useAuth";
import { enablePush, getPushSubscription, pushSupported } from "@/lib/push";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const KIND: Record<string, { icon: LucideIcon; tint: string }> = {
    lesson_completed: { icon: CheckCircle2, tint: "bg-emerald-500/15 text-emerald-500" },
    module_unlocked: { icon: Unlock, tint: "bg-sky-500/15 text-sky-500" },
    course_completed: { icon: Trophy, tint: "bg-amber-500/15 text-amber-500" },
    level_up: { icon: Rocket, tint: "bg-violet-500/15 text-violet-500" },
    streak_milestone: { icon: Flame, tint: "bg-orange-500/15 text-orange-500" },
    streak_risk: { icon: AlertTriangle, tint: "bg-amber-500/15 text-amber-500" },
    badge_unlocked: { icon: Award, tint: "bg-amber-500/15 text-amber-500" },
    xp_gain: { icon: Sparkles, tint: "bg-yellow-500/15 text-yellow-500" },
    system_success: { icon: CheckCircle2, tint: "bg-primary/15 text-primary" },
    system_failure: { icon: AlertCircle, tint: "bg-destructive/15 text-destructive" },
    payment: { icon: Wallet, tint: "bg-primary/15 text-primary" },
    subscription: { icon: Clock, tint: "bg-sky-500/15 text-sky-500" },
    comeback_1d: { icon: BellRing, tint: "bg-rose-500/15 text-rose-500" },
    comeback_3d: { icon: BellRing, tint: "bg-rose-500/15 text-rose-500" },
    comeback_7d: { icon: BellRing, tint: "bg-rose-500/15 text-rose-500" },
    comeback_14d: { icon: BellRing, tint: "bg-rose-500/15 text-rose-500" },
    morning_push: { icon: Sun, tint: "bg-amber-500/15 text-amber-500" },
    afternoon_push: { icon: CloudSun, tint: "bg-sky-500/15 text-sky-500" },
    evening_push: { icon: Sunset, tint: "bg-orange-500/15 text-orange-500" },
    night_push: { icon: Moon, tint: "bg-indigo-500/15 text-indigo-500" },
    unfinished_lesson: { icon: BookOpen, tint: "bg-sky-500/15 text-sky-500" },
    playlist_ready: { icon: ListVideo, tint: "bg-primary/15 text-primary" },
    quiz_reminder: { icon: HelpCircle, tint: "bg-violet-500/15 text-violet-500" },
    ai_summary: { icon: Brain, tint: "bg-violet-500/15 text-violet-500" },
    ai_quiz: { icon: Brain, tint: "bg-violet-500/15 text-violet-500" },
    ai_recommendation: { icon: Brain, tint: "bg-violet-500/15 text-violet-500" },
    weak_topic: { icon: Target, tint: "bg-rose-500/15 text-rose-500" },
};
const FALLBACK = { icon: Bell, tint: "bg-muted text-muted-foreground" };

const DHAKA = 6 * 3_600_000;
const dhakaDay = (ms: number) => new Date(ms + DHAKA).toISOString().slice(0, 10);

type Filter = "all" | "unread";

export const NotificationCenter = () => {
    const { items, unread, markAllRead, dismiss, open: openItem } = useNotifications();
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState<Filter>("all");

    const shown = filter === "unread" ? items.filter((n) => !n.read_at) : items;
    const today = dhakaDay(Date.now());
    const groups = [
        { label: "Today", list: shown.filter((n) => dhakaDay(Date.parse(n.sent_at)) === today) },
        { label: "Earlier", list: shown.filter((n) => dhakaDay(Date.parse(n.sent_at)) !== today) },
    ].filter((g) => g.list.length);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
                    className="relative"
                >
                    <Bell className="h-4 w-4" />
                    {unread > 0 && (
                        <span
                            key={unread}
                            className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background animate-in zoom-in-50"
                        >
                            {unread > 99 ? "99+" : unread}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                sideOffset={10}
                collisionPadding={12}
                className="glass-bar flex max-h-[min(560px,calc(100dvh-6rem))] w-[min(392px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl border p-0 shadow-elevated"
            >
                <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5">
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-base font-semibold">Notifications</h2>
                        {unread > 0 && (
                            <span className="text-xs font-medium text-primary tabular-nums">
                                {unread} new
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-0.5">
                        {unread > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 rounded-full px-2.5 text-xs"
                                onClick={() => void markAllRead()}
                            >
                                <CheckCheck className="mr-1 h-3.5 w-3.5" /> Mark all read
                            </Button>
                        )}
                        <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full"
                        >
                            <Link
                                to="/settings/notifications"
                                aria-label="Notification settings"
                                onClick={() => setOpen(false)}
                            >
                                <Settings className="h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                </div>

                <div className="px-4 pb-2">
                    <div role="tablist" className="glass-well inline-flex rounded-full p-0.5">
                        {(["all", "unread"] as const).map((f) => (
                            <button
                                key={f}
                                type="button"
                                role="tab"
                                aria-selected={filter === f}
                                onClick={() => setFilter(f)}
                                className={cn(
                                    "h-7 rounded-full px-3 text-xs font-medium transition-colors",
                                    filter === f
                                        ? "glass-lens text-primary"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {f === "all" ? "All" : `Unread${unread ? ` · ${unread}` : ""}`}
                            </button>
                        ))}
                    </div>
                </div>

                <PushPrompt />

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
                    {groups.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <CheckCheck className="h-6 w-6" />
                            </span>
                            <p className="text-sm font-medium">
                                {filter === "unread"
                                    ? "No unread notifications"
                                    : "You're all caught up"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Progress, streaks and payment updates show up here.
                            </p>
                        </div>
                    ) : (
                        groups.map((g) => (
                            <section key={g.label}>
                                <h3 className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    {g.label}
                                </h3>
                                <ul className="space-y-1 px-2">
                                    {g.list.map((n) => (
                                        <Item
                                            key={n.id}
                                            n={n}
                                            onOpen={() => {
                                                if (n.deep_link) setOpen(false);
                                                void openItem(n);
                                            }}
                                            onDismiss={() => void dismiss(n.id)}
                                        />
                                    ))}
                                </ul>
                            </section>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
};

const Item = ({
    n,
    onOpen,
    onDismiss,
}: {
    n: Notification;
    onOpen: () => void;
    onDismiss: () => void;
}) => {
    const kind = KIND[n.category] ?? FALLBACK;
    const unread = !n.read_at;
    return (
        <li className="group relative">
            <button
                type="button"
                onClick={onOpen}
                className={cn(
                    "flex w-full gap-3 rounded-2xl px-2.5 py-2.5 pr-9 text-left transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:outline-none",
                    unread && "bg-primary/[0.06]",
                )}
            >
                <span
                    className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                        kind.tint,
                    )}
                >
                    <kind.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-2">
                        <span
                            className={cn(
                                "line-clamp-2 flex-1 text-sm leading-snug",
                                unread ? "font-semibold" : "font-medium",
                            )}
                        >
                            {n.title}
                        </span>
                        {unread && (
                            <span
                                className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                                aria-label="Unread"
                            />
                        )}
                    </span>
                    {n.body && (
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                            {n.body}
                        </span>
                    )}
                    <span className="mt-1 block text-[11px] text-muted-foreground/80">
                        {formatDistanceToNowStrict(new Date(n.sent_at), { addSuffix: true })}
                    </span>
                </span>
            </button>
            <button
                type="button"
                aria-label="Dismiss"
                onClick={onDismiss}
                className="absolute right-1.5 top-2 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-opacity hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </li>
    );
};

/** Asks to turn on push for this device, if it supports it and isn't on yet. */
const PushPrompt = () => {
    const { user } = useAuth();
    const [state, setState] = useState<"hidden" | "offer" | "blocked">("hidden");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!pushSupported()) return;
        if (Notification.permission === "denied") {
            setState("blocked");
            return;
        }
        getPushSubscription()
            .then((sub) =>
                setState(sub && Notification.permission === "granted" ? "hidden" : "offer"),
            )
            .catch(() => setState("offer"));
    }, []);

    if (state === "hidden" || !user) return null;

    if (state === "blocked")
        return (
            <p className="mx-4 mb-2 rounded-2xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                Notifications are blocked for ZverTs in your browser settings, so you'll only see
                them here.
            </p>
        );

    return (
        <div className="mx-4 mb-2 flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/[0.07] px-3 py-2.5">
            <BellRing className="h-5 w-5 shrink-0 text-primary" />
            <p className="min-w-0 flex-1 text-xs leading-snug">
                <span className="font-medium">Get notified when ZverTs is closed</span>
                <span className="block text-muted-foreground">
                    Streak and course reminders on this device.
                </span>
            </p>
            <Button
                size="sm"
                className="h-8 shrink-0 rounded-full px-3"
                disabled={busy}
                onClick={async () => {
                    setBusy(true);
                    try {
                        await enablePush(user.id);
                        toast.success("Notifications are on for this device");
                        setState("hidden");
                    } catch (e) {
                        if (Notification.permission === "denied") setState("blocked");
                        toast.error((e as Error).message);
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Turn on"}
            </Button>
        </div>
    );
};
