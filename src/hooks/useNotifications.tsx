// The signed-in user's notifications, from one place for the whole app.
//
// NotificationsProvider keeps a single realtime subscription (the header has
// a bell for phones and one for laptops; both read this) and announces each
// new notification exactly once: a toast and a soft ding while ZverTs is on
// screen, a system notification while it's in the background. The system
// notification uses the notification id as its tag, the same tag the service
// worker uses for Web Push, so a push and the page never show it twice.
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type Notification = {
    id: string;
    user_id: string;
    category: string;
    priority: "critical" | "high" | "normal" | "low";
    title: string;
    body: string;
    deep_link: string | null;
    payload: Record<string, unknown>;
    read_at: string | null;
    dismissed_at: string | null;
    sent_at: string;
};

type Ctx = {
    items: Notification[];
    unread: number;
    loading: boolean;
    reload: () => Promise<void>;
    markRead: (id: string) => Promise<void>;
    markAllRead: () => Promise<void>;
    dismiss: (id: string) => Promise<void>;
    open: (n: Notification) => Promise<void>;
};

const LIMIT = 50;
const NotificationsContext = createContext<Ctx | null>(null);

export const NotificationsProvider = ({ children }: { children: ReactNode }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [items, setItems] = useState<Notification[]>([]);
    const [unread, setUnread] = useState(0);
    const [loading, setLoading] = useState(false);
    // The latest list, for handlers that must not re-subscribe when it changes.
    const itemsRef = useRef(items);
    itemsRef.current = items;
    const navigateRef = useRef(navigate);
    navigateRef.current = navigate;

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        const [{ data }, { data: cnt }] = await Promise.all([
            supabase
                .from("notifications")
                .select("*")
                // Admins can read everyone's rows (RLS), so always scope to the user.
                .eq("user_id", user.id)
                .is("dismissed_at", null)
                .order("sent_at", { ascending: false })
                .limit(LIMIT),
            supabase.rpc("unread_notification_count"),
        ]);
        setItems((data ?? []) as Notification[]);
        setUnread(typeof cnt === "number" ? cnt : 0);
        setLoading(false);
    }, [user]);

    useEffect(() => {
        if (!user) {
            setItems([]);
            setUnread(0);
            return;
        }
        void load();

        // Unique name per mount: StrictMode runs effects twice and a reused
        // channel name throws "callbacks after subscribe()".
        const channel = supabase
            .channel(`user:${user.id}:notifications:${Math.random().toString(36).slice(2)}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "notifications",
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    const n = payload.new as Notification;
                    if (itemsRef.current.some((x) => x.id === n.id)) return;
                    setItems((cur) => [n, ...cur].slice(0, LIMIT));
                    if (!n.read_at) setUnread((c) => c + 1);
                    announce(n, (link) => navigateRef.current(link));
                },
            )
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "notifications",
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    const n = payload.new as Notification;
                    const prev = itemsRef.current.find((x) => x.id === n.id);
                    // Only a change from unread lowers the count, so an update we
                    // already applied locally (markRead) isn't counted twice.
                    if (prev && !prev.read_at && (n.read_at || n.dismissed_at))
                        setUnread((c) => Math.max(0, c - 1));
                    setItems((cur) =>
                        n.dismissed_at
                            ? cur.filter((x) => x.id !== n.id)
                            : cur.map((x) => (x.id === n.id ? n : x)),
                    );
                },
            )
            .subscribe();

        // Realtime drops events while a phone sleeps or the network is gone;
        // catch up whenever ZverTs comes back.
        const refresh = () => {
            if (document.visibilityState === "visible") void load();
        };
        document.addEventListener("visibilitychange", refresh);
        window.addEventListener("online", refresh);

        return () => {
            void supabase.removeChannel(channel);
            document.removeEventListener("visibilitychange", refresh);
            window.removeEventListener("online", refresh);
        };
    }, [user, load]);

    const markRead = useCallback(async (id: string) => {
        const n = itemsRef.current.find((x) => x.id === id);
        if (!n || n.read_at) return;
        const now = new Date().toISOString();
        setItems((cur) => cur.map((x) => (x.id === id ? { ...x, read_at: now } : x)));
        setUnread((c) => Math.max(0, c - 1));
        await supabase.rpc("mark_notification_read", { _id: id });
        await supabase.rpc("log_notification_event", { _id: id, _type: "opened" });
    }, []);

    const markAllRead = useCallback(async () => {
        const now = new Date().toISOString();
        setItems((cur) => cur.map((x) => (x.read_at ? x : { ...x, read_at: now })));
        setUnread(0);
        await supabase.rpc("mark_all_notifications_read");
    }, []);

    const dismiss = useCallback(async (id: string) => {
        const n = itemsRef.current.find((x) => x.id === id);
        setItems((cur) => cur.filter((x) => x.id !== id));
        if (n && !n.read_at) setUnread((c) => Math.max(0, c - 1));
        await supabase.rpc("dismiss_notification", { _id: id });
    }, []);

    const open = useCallback(
        async (n: Notification) => {
            void markRead(n.id);
            if (!n.deep_link) return;
            void supabase.rpc("log_notification_event", { _id: n.id, _type: "clicked" });
            navigate(n.deep_link);
        },
        [markRead, navigate],
    );

    const value = useMemo(
        () => ({ items, unread, loading, reload: load, markRead, markAllRead, dismiss, open }),
        [items, unread, loading, load, markRead, markAllRead, dismiss, open],
    );
    return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
};

export const useNotifications = () => {
    const ctx = useContext(NotificationsContext);
    if (!ctx) throw new Error("useNotifications must be used inside NotificationsProvider");
    return ctx;
};

/** Tell the user about a notification that just arrived, once. */
function announce(n: Notification, go: (link: string) => void) {
    if (document.visibilityState === "visible") {
        if (n.priority === "low") return;
        playDing();
        toast(n.title, {
            description: n.body,
            action: n.deep_link ? { label: "Open", onClick: () => go(n.deep_link!) } : undefined,
        });
        return;
    }
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
        const note = new Notification(n.title || "ZverTs", {
            body: n.body || "",
            icon: "/android-chrome-192x192.png",
            badge: "/favicon-32x32.png",
            tag: n.id,
            requireInteraction: n.priority === "critical",
        });
        note.onclick = () => {
            window.focus();
            if (n.deep_link) go(n.deep_link);
            note.close();
        };
    } catch {
        /* Some browsers (Android Chrome) only allow notifications from the service worker. */
    }
}

type WindowWithAudio = Window & { webkitAudioContext?: typeof AudioContext };

/** A short soft ding (Web Audio, no asset). */
function playDing() {
    try {
        const Ctx = window.AudioContext || (window as WindowWithAudio).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.type = "sine";
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
        o.start();
        o.stop(ctx.currentTime + 0.42);
        setTimeout(() => void ctx.close().catch(() => {}), 600);
    } catch {
        /* Web Audio unavailable or blocked until the user interacts. */
    }
}
