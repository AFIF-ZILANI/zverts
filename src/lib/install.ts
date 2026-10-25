// "Install ZverTs": the browser's install offer, captured as early as possible.
// Chrome/Edge fire beforeinstallprompt once, often before React has mounted,
// so it's caught here (imported by main.tsx) and handed to whoever asks.
// iPhone and iPad have no such event; there people add ZverTs from Safari's
// Share menu, so the app shows them how instead.
import { useSyncExternalStore } from "react";

type BIPEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BIPEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        deferred = e as BIPEvent;
        emit();
    });
    window.addEventListener("appinstalled", () => {
        deferred = null;
        installed = true;
        emit();
    });
}

export const isStandalone = () =>
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true);

const isIOS = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * "installed": running as the app, or just installed.
 * "prompt": the browser can install it with one tap.
 * "ios": iPhone/iPad, installed from the Share menu.
 * "none": this browser can't install it (or already has it).
 */
export type InstallMode = "installed" | "prompt" | "ios" | "none";

const mode = (): InstallMode =>
    installed || isStandalone() ? "installed" : deferred ? "prompt" : isIOS() ? "ios" : "none";

export const useInstallMode = () =>
    useSyncExternalStore(
        (l) => {
            listeners.add(l);
            return () => listeners.delete(l);
        },
        mode,
        () => "none" as InstallMode,
    );

/** Shows the browser's install dialog. True if the person installed. */
export const promptInstall = async () => {
    const e = deferred;
    if (!e) return false;
    deferred = null;
    await e.prompt();
    const { outcome } = await e.userChoice;
    emit();
    return outcome === "accepted";
};
