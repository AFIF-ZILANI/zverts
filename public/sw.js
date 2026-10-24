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
//   - Code runner: its editor files and workers (listed in /runner-assets.json)
//     and the Pyodide / Clang runtimes from the CDN go to RUNNER_CACHE when first
//     fetched (cache-first). That cache survives deploys (only files no longer
//     listed are dropped), so the runner keeps working offline once used.
//   - Everything else (Supabase, YouTube, /version.json, analytics) is never touched.

const SHELL_CACHE = "zverts-shell-v1";
const ASSET_CACHE = "zverts-assets-v1";
const RUNNER_CACHE = "zverts-runner-v1"; // keep in sync with src/components/app/code-runner/cdn.ts
const RUNNER_MANIFEST = "/runner-assets.json";

// { files: ["/assets/…"], cdn: ["https://cdn.jsdelivr.net/…/"] } — fetched on
// install and kept in RUNNER_CACHE, since the worker can be restarted anytime.
let runnerManifest = null;
const loadRunnerManifest = async () => {
    if (runnerManifest) return runnerManifest;
    const cache = await caches.open(RUNNER_CACHE);
    const res = (await cache.match(RUNNER_MANIFEST)) || (await fetch(RUNNER_MANIFEST).catch(() => null));
    const data = res && res.ok ? await res.clone().json().catch(() => null) : null;
    runnerManifest = { files: new Set(data?.files ?? []), cdn: data?.cdn ?? [] };
    return runnerManifest;
};
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
            // This build's runner file list (the runner files themselves load on demand).
            const manifest = await fetch(RUNNER_MANIFEST, { cache: "no-store" }).catch(() => null);
            if (manifest?.ok) {
                const runner = await caches.open(RUNNER_CACHE);
                const { files } = await manifest.clone().json();
                // Someone who has used the runner (editor files in the cache) gets
                // this build's editor files now, so it still opens offline after a
                // deploy. Others download nothing until they open it.
                const used = (await runner.keys()).some((r) => new URL(r.url).pathname.startsWith("/assets/"));
                if (used) {
                    // Shared chunks are in this build's precache. Anything else must
                    // land in RUNNER_CACHE: a copy in ASSET_CACHE (fetched while the
                    // old worker ran) is pruned when this one activates.
                    const precached = new Set(await precacheList());
                    await Promise.all(
                        files
                            .filter((url) => !precached.has(url))
                            .map(async (url) => {
                                if (await runner.match(url, { ignoreVary: true })) return;
                                const elsewhere = await caches.match(url, { ignoreVary: true });
                                if (elsewhere) await runner.put(url, elsewhere);
                                else await runner.add(url).catch(() => {});
                            }),
                    );
                }
                await runner.put(RUNNER_MANIFEST, manifest);
                runnerManifest = null;
            }
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
                    .filter(
                        (k) =>
                            k.startsWith("zverts-") &&
                            k !== SHELL_CACHE &&
                            k !== ASSET_CACHE &&
                            k !== RUNNER_CACHE,
                    )
                    .map((k) => caches.delete(k)),
            );
            // Drop files from older builds (anything not in this build's list).
            const keep = new Set((await precacheList()).map((u) => new URL(u, self.location.origin).href));
            if (keep.size) {
                const assets = await caches.open(ASSET_CACHE);
                for (const req of await assets.keys()) if (!keep.has(req.url)) await assets.delete(req);
            }
            // Runner cache: keep this build's editor files and the current CDN
            // runtime versions; a new Pyodide/Clang version replaces the old one.
            runnerManifest = null;
            const { files, cdn } = await loadRunnerManifest();
            if (files.size) {
                const runner = await caches.open(RUNNER_CACHE);
                for (const req of await runner.keys()) {
                    const u = new URL(req.url);
                    const current =
                        u.origin === self.location.origin
                            ? u.pathname === RUNNER_MANIFEST || files.has(u.pathname)
                            : cdn.some((prefix) => req.url.startsWith(prefix));
                    if (!current) await runner.delete(req);
                }
            }
            await self.clients.claim();
        })(),
    );
});

self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) {
        // Pyodide / Clang from the CDN: versioned URLs, so cache-first is safe.
        if (url.hostname === "cdn.jsdelivr.net") {
            event.respondWith(
                loadRunnerManifest().then(({ cdn }) =>
                    cdn.some((prefix) => req.url.startsWith(prefix)) ? runnerCacheFirst(event, req) : fetch(req),
                ),
            );
        }
        return;
    }

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
            (async () => {
                // ignoreVary: precached copies were fetched without the page's Origin
                // header; hashed files are identical regardless.
                const hit = await caches.match(req, { ignoreVary: true });
                if (hit) return hit;
                const res = await fetch(req);
                if (res.ok) {
                    const { files } = await loadRunnerManifest();
                    const cache = await caches.open(files.has(url.pathname) ? RUNNER_CACHE : ASSET_CACHE);
                    await cache.put(req, res.clone());
                }
                return res;
            })(),
        );
    }
});

// Hands the response to the page right away and stores the copy in the
// background — the Clang download is ~70 MB, too big to hold back.
const runnerCacheFirst = async (event, req) => {
    const cache = await caches.open(RUNNER_CACHE);
    const hit = await cache.match(req, { ignoreVary: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) event.waitUntil(cache.put(req, res.clone()).catch(() => {}));
    return res;
};

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
