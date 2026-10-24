import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const CHECK_INTERVAL_MS = 5 * 60_000;

const fetchDeployedVersion = async (): Promise<string | null> => {
    try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return null;
        const data = (await res.json()) as { version?: unknown };
        return typeof data.version === "string" ? data.version : null;
    } catch {
        return null;
    }
};

// Detects when a newer build has been deployed while this tab is open. Old tabs
// keep running old code, which can call RPCs that no longer exist. Once a new
// version is seen, the next route change does a full reload (so nobody loses a
// video or a half-filled form mid-page), and a toast offers to reload right away.
const useVersionCheck = () => {
    const { t } = useTranslation();
    const location = useLocation();
    const stale = useRef(false);
    const firstPath = useRef(location.pathname);

    useEffect(() => {
        if (import.meta.env.DEV) return;

        const check = async () => {
            if (stale.current) return;
            const deployed = await fetchDeployedVersion();
            if (!deployed || deployed === __APP_VERSION__) return;
            stale.current = true;
            toast(t("update.available"), {
                duration: Infinity,
                action: { label: t("update.reload"), onClick: () => window.location.reload() },
            });
        };

        const onVisible = () => {
            if (document.visibilityState === "visible") void check();
        };

        void check();
        const id = window.setInterval(check, CHECK_INTERVAL_MS);
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            window.clearInterval(id);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [t]);

    useEffect(() => {
        if (location.pathname === firstPath.current) return;
        firstPath.current = location.pathname;
        if (stale.current) window.location.reload();
    }, [location.pathname]);
};

export const VersionWatcher = () => {
    useVersionCheck();
    return null;
};
