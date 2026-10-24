import { supabase } from "@/integrations/supabase/client";

// VAPID public key for Web Push (safe to ship; the private key is the
// VAPID_PRIVATE_KEY secret of the push-send Edge Function).
const VAPID_PUBLIC_KEY = "BHAtTS8gaVjxsQaBJksVWiGV7IB4fKV-sd7UiLF-ShhncjzZrFXwEigBjUmaL3bdb-qt0o_N0wYWM7IvT4_7U5A";

export const pushSupported = () =>
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

export const registerServiceWorker = () => {
    if (import.meta.env.DEV || !("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
        // Build id in the URL so every deploy installs a fresh worker (and precache).
        navigator.serviceWorker.register(`/sw.js?v=${__APP_VERSION__}`).catch((err) => {
            console.warn("Service worker registration failed:", err);
        });
    });
};

const urlBase64ToUint8Array = (b64: string) => {
    const padded = (b64 + "=".repeat((4 - (b64.length % 4)) % 4))
        .replace(/-/g, "+")
        .replace(/_/g, "/");
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

const registration = () =>
    navigator.serviceWorker.getRegistration("/").then((r) => r ?? navigator.serviceWorker.ready);

export const getPushSubscription = async (): Promise<PushSubscription | null> => {
    if (!pushSupported()) return null;
    const reg = await registration();
    return reg.pushManager.getSubscription();
};

// Asks for permission if needed, subscribes this device and saves it for the user.
export const enablePush = async (userId: string): Promise<void> => {
    if (!pushSupported()) throw new Error("Push notifications aren't supported on this device");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Notification permission was not granted");

    const reg = await registration();
    const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));

    const json = sub.toJSON();
    const { error } = await supabase.from("push_subscriptions").upsert(
        {
            user_id: userId,
            endpoint: sub.endpoint,
            p256dh: json.keys?.p256dh ?? "",
            auth: json.keys?.auth ?? "",
            user_agent: navigator.userAgent.slice(0, 300),
        },
        { onConflict: "endpoint" },
    );
    if (error) throw error;
};

export const disablePush = async (): Promise<void> => {
    const sub = await getPushSubscription();
    if (!sub) return;
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
};
