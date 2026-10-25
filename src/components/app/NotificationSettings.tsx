// Settings → Notifications: push on this device (with a test), which kinds of
// notifications to get, quiet hours and a daily limit. Every change saves at
// once to notification_preferences, which dispatch_notification() reads.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellOff, BellRing, Flame, Moon, Send, Sparkles, Trophy, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { notificationPrefsQuery } from "@/lib/offline/queries";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { SettingsGroup, SettingsRow } from "@/components/app/settings/SettingsUI";
import { disablePush, enablePush, getPushSubscription, pushSupported } from "@/lib/push";

type Prefs = {
    mute_all: boolean;
    study_reminders: boolean;
    system_alerts: boolean;
    gamification: boolean;
    comeback: boolean;
    max_per_day: number;
    quiet_hours_start: number;
    quiet_hours_end: number;
};

const DEFAULTS: Prefs = {
    mute_all: false,
    study_reminders: true,
    system_alerts: true,
    gamification: true,
    comeback: true,
    max_per_day: 4,
    quiet_hours_start: 0,
    quiet_hours_end: 7,
};

const hourLabel = (h: number) =>
    new Date(Date.UTC(2000, 0, 1, h)).toLocaleTimeString("en-US", {
        hour: "numeric",
        timeZone: "UTC",
    });
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export const NotificationSettings = ({ userId }: { userId: string }) => {
    const [p, setP] = useState<Prefs | null>(null);

    useEffect(() => {
        notificationPrefsQuery(userId).then(({ data }) => setP({ ...DEFAULTS, ...(data ?? {}) }));
    }, [userId]);

    const save = async (patch: Partial<Prefs>) => {
        if (!p) return;
        const prev = p;
        const next = { ...p, ...patch };
        setP(next);
        const { error } = await supabase
            .from("notification_preferences")
            .upsert({ user_id: userId, ...next });
        if (error) {
            setP(prev);
            toast.error(`Couldn't save: ${error.message}`);
        }
    };

    const kinds: { k: keyof Prefs; title: string; body: string; icon: typeof Flame }[] = [
        {
            k: "comeback",
            title: "Come-back reminders",
            body: "If you're away 3 days: one reminder that evening and the next two.",
            icon: BellRing,
        },
        {
            k: "study_reminders",
            title: "Streak reminders",
            body: "An evening nudge when your streak would break today.",
            icon: Flame,
        },
        {
            k: "gamification",
            title: "Achievements",
            body: "Level ups, streak milestones and badges.",
            icon: Trophy,
        },
        {
            k: "system_alerts",
            title: "Account and payments",
            body: "Payment approvals, refunds and course imports.",
            icon: Wallet,
        },
    ];

    return (
        <>
            <SettingsGroup
                title="This device"
                footer={
                    pushSupported()
                        ? "Push works even when ZverTs is closed. Turn it on for each phone or computer you use."
                        : "Push isn't supported in this browser. On iPhone, add ZverTs to your Home Screen first."
                }
            >
                <PushRow userId={userId} />
            </SettingsGroup>

            {p && (
                <>
                    <SettingsGroup footer="Announcements from the ZverTs team still come through.">
                        <SettingsRow
                            icon={BellOff}
                            title="Pause all notifications"
                            description="Nothing new in the bell or as push until you turn this off."
                            control={
                                <Switch
                                    checked={p.mute_all}
                                    onCheckedChange={(v) => void save({ mute_all: v })}
                                    aria-label="Pause all notifications"
                                />
                            }
                        />
                    </SettingsGroup>

                    <SettingsGroup title="What to get">
                        {kinds.map((it) => (
                            <SettingsRow
                                key={it.k}
                                icon={it.icon}
                                title={it.title}
                                description={it.body}
                                control={
                                    <Switch
                                        checked={!!p[it.k] && !p.mute_all}
                                        disabled={p.mute_all}
                                        onCheckedChange={(v) => void save({ [it.k]: v })}
                                        aria-label={it.title}
                                    />
                                }
                            />
                        ))}
                    </SettingsGroup>

                    <SettingsGroup title="When" footer="Times are Bangladesh time.">
                        <SettingsRow
                            icon={Moon}
                            title="Quiet hours"
                            description="No reminders between these times."
                            stack
                            control={
                                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                    <HourSelect
                                        value={p.quiet_hours_start}
                                        onChange={(h) => void save({ quiet_hours_start: h })}
                                        label="Quiet from"
                                    />
                                    <span className="text-sm text-muted-foreground">to</span>
                                    <HourSelect
                                        value={p.quiet_hours_end}
                                        onChange={(h) => void save({ quiet_hours_end: h })}
                                        label="Quiet until"
                                    />
                                </div>
                            }
                        />
                        <SettingsRow
                            icon={Sparkles}
                            title="Daily limit"
                            description="The most notifications you'll get in a day."
                            control={
                                <Select
                                    value={String(p.max_per_day)}
                                    onValueChange={(v) => void save({ max_per_day: Number(v) })}
                                >
                                    <SelectTrigger
                                        className="w-24 rounded-full"
                                        aria-label="Daily limit"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[2, 3, 4, 6, 8, 10].map((n) => (
                                            <SelectItem key={n} value={String(n)}>
                                                {n} a day
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            }
                        />
                    </SettingsGroup>
                </>
            )}
        </>
    );
};

const HourSelect = ({
    value,
    onChange,
    label,
}: {
    value: number;
    onChange: (h: number) => void;
    label: string;
}) => (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="rounded-full" aria-label={label}>
            <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-72">
            {HOURS.map((h) => (
                <SelectItem key={h} value={String(h)}>
                    {hourLabel(h)}
                </SelectItem>
            ))}
        </SelectContent>
    </Select>
);

/** Push on/off for this browser or installed app, plus a test send. */
const PushRow = ({ userId }: { userId: string }) => {
    const supported = pushSupported();
    const [on, setOn] = useState(false);
    const [busy, setBusy] = useState(supported);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        if (!supported) return;
        getPushSubscription()
            .then((sub) => setOn(!!sub && Notification.permission === "granted"))
            .catch(() => setOn(false))
            .finally(() => setBusy(false));
    }, [supported]);

    const toggle = async (next: boolean) => {
        setBusy(true);
        try {
            if (next) await enablePush(userId);
            else await disablePush();
            setOn(next);
            toast.success(next ? "Push is on for this device" : "Push is off for this device");
        } catch (e) {
            toast.error(
                typeof Notification !== "undefined" && Notification.permission === "denied"
                    ? "Notifications are blocked for ZverTs. Allow them in your browser's site settings, then try again."
                    : (e as Error).message,
            );
        } finally {
            setBusy(false);
        }
    };

    const test = async () => {
        setTesting(true);
        const { error } = await supabase.rpc("send_test_notification");
        setTesting(false);
        if (error) toast.error(error.message);
        else if (!on) toast.success("Sent — check the bell");
    };

    return (
        <SettingsRow
            icon={BellRing}
            title="Push notifications"
            description={on ? "On for this device." : "Get reminders even when ZverTs is closed."}
            control={
                <Switch
                    checked={on}
                    disabled={!supported || busy}
                    onCheckedChange={toggle}
                    aria-label="Push notifications"
                />
            }
        >
            <div className="mt-3 pl-8">
                <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    disabled={testing}
                    onClick={test}
                >
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    Send a test notification
                </Button>
            </div>
        </SettingsRow>
    );
};
