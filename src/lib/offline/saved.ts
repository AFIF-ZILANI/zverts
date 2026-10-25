// A last-good copy of a page's data in localStorage, per user. The service
// worker keeps copies too, but only of requests it has seen with the same
// URL and body; this is the fallback when that misses, so an offline page
// shows what it last showed instead of an error.
const key = (userId: string, name: string) => `zverts.saved:${userId}:${name}`;

export const remember = (userId: string, name: string, data: unknown) => {
    try {
        localStorage.setItem(key(userId, name), JSON.stringify({ at: Date.now(), data }));
    } catch {
        /* full or unavailable: the service worker copy still applies */
    }
};

export const recall = <T>(userId: string, name: string): { at: number; data: T } | null => {
    try {
        const raw = localStorage.getItem(key(userId, name));
        return raw ? (JSON.parse(raw) as { at: number; data: T }) : null;
    } catch {
        return null;
    }
};

const NETWORK = /failed to fetch|networkerror|load failed|network request failed|fetch failed/i;

/** True when an error just means "no connection". */
export const isOfflineError = (e: unknown) =>
    !navigator.onLine || NETWORK.test(String((e as Error)?.message ?? e));

/** Words for an error a learner might see. */
export const friendlyError = (e: unknown) =>
    isOfflineError(e)
        ? "You're offline and this hasn't been saved on this device yet. It will load when you're back online."
        : String((e as Error)?.message ?? "Something went wrong. Try again.");
