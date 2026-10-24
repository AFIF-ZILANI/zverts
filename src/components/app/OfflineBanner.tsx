import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

// Shown while the device has no connection. The service worker still serves the
// app shell offline, but anything that needs the server won't load until it's back.
export const OfflineBanner = () => {
    const [offline, setOffline] = useState(() => !navigator.onLine);

    useEffect(() => {
        const update = () => setOffline(!navigator.onLine);
        window.addEventListener("online", update);
        window.addEventListener("offline", update);
        return () => {
            window.removeEventListener("online", update);
            window.removeEventListener("offline", update);
        };
    }, []);

    if (!offline) return null;
    return (
        <div
            role="status"
            className="flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400"
        >
            <WifiOff className="h-3.5 w-3.5" />
            You're offline — showing what's saved on this device
        </div>
    );
};
