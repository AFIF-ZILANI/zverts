import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, Download, Loader2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OFFLINE_FILES, RUNNER_CACHE } from "./cdn";

type Ready = { editor: boolean; python: boolean; clang: boolean };

// This build's editor files (/runner-assets.json, written by vite.config.ts).
const editorFiles = async (): Promise<string[]> => {
    // The service worker stores this build's list on install; offline that's the only copy.
    const res =
        (await caches.match("/runner-assets.json")) ??
        (await fetch("/runner-assets.json").catch(() => null));
    const data = res?.ok ? await res.json().catch(() => null) : null;
    return data?.files ?? [];
};

// ignoreVary: the CDN answers with "Vary: Accept-Encoding". Any cache, not just
// RUNNER_CACHE: the editor's shared chunks are in the install-time precache.
const allCached = async (urls: string[]) =>
    urls.length > 0 &&
    (await Promise.all(urls.map((u) => caches.match(u, { ignoreVary: true })))).every(Boolean);

const readCache = async (): Promise<Ready> => {
    const [editor, python, clang] = await Promise.all([
        editorFiles().then(allCached),
        allCached(OFFLINE_FILES.python),
        allCached(OFFLINE_FILES.clang),
    ]);
    return { editor, python, clang };
};

// The service worker stores runner files as they load, but not ones fetched
// before it took control of the page (a first visit) — those came straight
// from the network. Store whatever is missing; usually the HTTP cache has it.
const cacheMissing = async (urls: string[]) => {
    const cache = await caches.open(RUNNER_CACHE);
    await Promise.all(
        urls.map(async (u) => {
            if (!(await caches.match(u, { ignoreVary: true }))) await cache.add(u).catch(() => {});
        }),
    );
};
const cacheEditorFiles = async () => cacheMissing(await editorFiles());

const useOnline = () => {
    const [online, setOnline] = useState(() => navigator.onLine);
    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener("online", on);
        window.addEventListener("offline", off);
        return () => {
            window.removeEventListener("online", on);
            window.removeEventListener("offline", off);
        };
    }, []);
    return online;
};

/**
 * Which runtimes are stored for offline use (the service worker keeps them in
 * RUNNER_CACHE once fetched), with a button to fetch both ahead of time.
 * Hidden without a service worker (dev server, unsupported browsers).
 */
export const OfflineStatus = () => {
    const online = useOnline();
    const [ready, setReady] = useState<Ready | null>(null);
    const [downloading, setDownloading] = useState(false);
    const controlled = typeof navigator !== "undefined" && !!navigator.serviceWorker?.controller;

    const refresh = useCallback(async () => {
        if (!controlled || !("caches" in window)) return;
        setReady(await readCache().catch(() => null));
    }, [controlled]);

    useEffect(() => {
        if (controlled && navigator.onLine) void cacheEditorFiles().then(refresh);
        void refresh();
        // The service worker stores files in the background after they load
        // (on first Run too), so look again for a little while.
        const id = setInterval(refresh, 3000);
        const stop = setTimeout(() => clearInterval(id), 120_000);
        return () => {
            clearInterval(id);
            clearTimeout(stop);
        };
    }, [controlled, refresh]);

    if (!controlled || !ready) return null;

    const download = async () => {
        setDownloading(true);
        // Ask the browser not to evict the ~120 MB of runtimes under storage pressure.
        void navigator.storage?.persist?.();
        await Promise.allSettled([
            cacheEditorFiles(),
            cacheMissing(OFFLINE_FILES.python),
            cacheMissing(OFFLINE_FILES.clang),
        ]);
        setReady(await readCache().catch(() => null));
        setDownloading(false);
    };

    const chip = (label: string, ok: boolean) => (
        <span
            className={cn(
                "inline-flex items-center gap-1",
                ok ? "text-primary" : "text-muted-foreground",
            )}
        >
            {ok ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
                <CircleDashed className="h-3.5 w-3.5" />
            )}
            {label}
        </span>
    );

    const allReady = ready.editor && ready.python && ready.clang;

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 border-t border-border text-xs font-mono shrink-0">
            {!online && (
                <span className="inline-flex items-center gap-1 text-amber-500">
                    <WifiOff className="h-3.5 w-3.5" /> Offline
                </span>
            )}
            <span className="text-muted-foreground">Works offline:</span>
            {chip("Editor", ready.editor)}
            {chip("C/C++", ready.clang)}
            {chip("Python", ready.python)}
            {!allReady && online && (
                <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-8 text-xs"
                    onClick={download}
                    disabled={downloading}
                >
                    {downloading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                        <Download className="h-3.5 w-3.5 mr-1" />
                    )}
                    {downloading ? "Downloading…" : "Download for offline (~27 MB)"}
                </Button>
            )}
        </div>
    );
};
