import { createClient, type Session } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
    },
});

// ── Offline: don't wait for a token refresh that can't happen ────────────
// Every query asks auth.getSession() for a token first. When the saved access
// token is near expiry (it lasts an hour, so almost always when ZverTs is
// reopened offline), getSession() tries to refresh it and keeps retrying for
// up to 30 s, holding up every request; then it gives up and requests go out
// without the user's token, which the service worker's offline copy (stored
// per user) doesn't match. So: offline, answer from the saved session at once;
// online, give the refresh a few seconds before falling back to it. The
// refresh itself carries on in the background and wins once it succeeds.
const REFRESH_WAIT_MS = 4000;
const auth = supabase.auth as typeof supabase.auth & { storageKey: string };

const savedSession = (): Session | null => {
    try {
        const raw = localStorage.getItem(auth.storageKey);
        const s = raw ? (JSON.parse(raw) as Session) : null;
        return s?.access_token && s.user ? s : null;
    } catch {
        return null;
    }
};

const getSession = auth.getSession.bind(auth);
auth.getSession = async () => {
    const saved = savedSession();
    if (!saved) return getSession();
    if (!navigator.onLine) return { data: { session: saved }, error: null };
    const live = getSession();
    const fallback = new Promise<Awaited<ReturnType<typeof getSession>>>((resolve) =>
        setTimeout(
            () => resolve({ data: { session: savedSession() ?? saved }, error: null }),
            REFRESH_WAIT_MS,
        ),
    );
    return Promise.race([live, fallback]);
};
