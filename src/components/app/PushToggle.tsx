import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { disablePush, enablePush, getPushSubscription, pushSupported } from "@/lib/push";

// Per-device switch: subscribes this browser/installed app to Web Push so
// notifications arrive even when ZverTs is closed. Applies immediately.
export const PushToggle = ({ userId }: { userId: string }) => {
    const supported = pushSupported();
    const [on, setOn] = useState(false);
    const [busy, setBusy] = useState(supported);

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
            if (next) {
                await enablePush(userId);
                toast.success("Push notifications are on for this device");
            } else {
                await disablePush();
                toast.success("Push notifications are off for this device");
            }
            setOn(next);
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div>
                <div className="font-medium">Push notifications on this device</div>
                <p className="text-sm text-muted-foreground">
                    {supported
                        ? "Get reminders and updates even when ZverTs is closed."
                        : "Not supported here. On iPhone, add ZverTs to your Home Screen first."}
                </p>
            </div>
            <Switch checked={on} disabled={!supported || busy} onCheckedChange={toggle} />
        </div>
    );
};
