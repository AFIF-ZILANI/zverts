// ZverTs service worker: offline app shell + Web Push.
//
// Caching:
//   - /assets/* are content-hashed by Vite, so they're cached forever (cache-first).
//     On install, every route page's JS/CSS from /precache.json (written at build
//     time) is cached too, so pages open offline even if never visited.
//     The page registers /sw.js?v=<build id>, so each deploy installs afresh.
//   - Page navigations go to the network first so a new deploy is picked up
//     immediately; offline they fall back to the cached app shell (/index.html).
//   - Logo, icons and manifest (SHELL_URLS) are network-first with a cache fallback.
//   - Everything else (Supabase, YouTube, /version.json, analytics) is never touched.

const SHELL_CACHE = "zverts-shell-v1";
const ASSET_CACHE = "zverts-assets-v1";
const SHELL_URLS = ["/", "/manifest.json", "/android-chrome-192x192.png", "/hero-light.svg", "/hero-dark.svg"];

const precacheList = () =>
    fetch("/precache.json", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []);

self.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const shell = await caches.open(SHELL_CACHE);
            await shell.addAll(SHELL_URLS);
            const assets = await caches.open(ASSET_CACHE);
            // One by one: a single missing file must not fail the whole install.
            await Promise.all(
                (await precacheList()).map((url) =>
                    assets
                        .match(url, { ignoreVary: true })
                        .then((hit) => hit || assets.add(url).catch(() => {})),
                ),
            );
            await self.skipWaiting();
        })(),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys
                    .filter((k) => k.startsWith("zverts-") && k !== SHELL_CACHE && k !== ASSET_CACHE)
                    .map((k) => caches.delete(k)),
            );
            // Drop files from older builds (anything not in this build's list).
            const keep = new Set((await precacheList()).map((u) => new URL(u, self.location.origin).href));
            if (keep.size) {
                const assets = await caches.open(ASSET_CACHE);
                for (const req of await assets.keys()) if (!keep.has(req.url)) await assets.delete(req);
            }
            await self.clients.claim();
        })(),
    );
});

self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    if (req.mode === "navigate") {
        event.respondWith(
            fetch(req)
                .then((res) => {
                    if (res.ok) {
                        const copy = res.clone();
                        caches.open(SHELL_CACHE).then((c) => c.put("/", copy));
                    }
                    return res;
                })
                .catch(() => caches.match("/", { cacheName: SHELL_CACHE, ignoreVary: true })),
        );
        return;
    }

    // Logo, icons and manifest: fresh when online, from the shell cache offline.
    if (SHELL_URLS.includes(url.pathname) && url.pathname !== "/") {
        event.respondWith(
            fetch(req).catch(() => caches.match(url.pathname, { cacheName: SHELL_CACHE, ignoreVary: true })),
        );
        return;
    }

    if (url.pathname.startsWith("/assets/")) {
        event.respondWith(
            caches.open(ASSET_CACHE).then(async (cache) => {
                // ignoreVary: precached copies were fetched without the page's Origin
                // header; hashed files are identical regardless.
                const hit = await cache.match(req, { ignoreVary: true });
                if (hit) return hit;
                const res = await fetch(req);
                if (res.ok) await cache.put(req, res.clone());
                return res;
            }),
        );
    }
});

// ── Web Push ────────────────────────────────────────────────────────────────
// Payload from the push-send Edge Function: { id, title, body, deep_link, priority }.
self.addEventListener("push", (event) => {
    let n = {};
    try {
        n = event.data ? event.data.json() : {};
    } catch {
        n = { title: "ZverTs", body: event.data ? event.data.text() : "" };
    }
    event.waitUntil(
        self.registration.showNotification(n.title || "ZverTs", {
            body: n.body || "",
            icon: "/android-chrome-192x192.png",
            badge: "/favicon-32x32.png",
            // Same tag as the in-page popup (useBrowserNotifications), so an open tab
            // and a push for the same notification show only one.
            tag: n.id || undefined,
            requireInteraction: n.priority === "critical",
            data: { url: n.deep_link || "/dashboard" },
        }),
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const target = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
            for (const w of wins) {
                if (w.url.startsWith(self.location.origin)) {
                    w.focus();
                    return w.navigate(target);
                }
            }
            return self.clients.openWindow(target);
        }),
    );
});
