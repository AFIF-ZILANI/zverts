// "Install ZverTs": a card that offers it a few seconds after someone arrives
// (snoozed for a week when closed), the iPhone how-to, and the menu row.
import { useEffect, useState } from "react";
import { Download, Plus, Share, Smartphone, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { SettingsGroup, SettingsNavRow } from "@/components/app/settings/SettingsUI";
import { promptInstall, useInstallMode } from "@/lib/install";
import { toast } from "sonner";

const SNOOZE_KEY = "zverts.installSnoozedUntil";
const SNOOZE_MS = 7 * 86_400_000;
const SHOW_AFTER_MS = 6000;

const snoozed = () => {
    try {
        return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
    } catch {
        return false;
    }
};
const snooze = () => {
    try {
        localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
        /* storage unavailable: it may show again next visit */
    }
};

/** Runs the install: the browser's dialog, or the iPhone steps. */
const useInstallAction = () => {
    const mode = useInstallMode();
    const [iosHelp, setIosHelp] = useState(false);
    const install = async () => {
        if (mode === "ios") {
            setIosHelp(true);
            return;
        }
        if (await promptInstall()) toast.success("ZverTs is installed. Open it from your home screen.");
    };
    return { mode, install, iosHelp, setIosHelp };
};

/** The floating offer. */
export const InstallPrompt = () => {
    const { mode, install, iosHelp, setIosHelp } = useInstallAction();
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if ((mode !== "prompt" && mode !== "ios") || snoozed()) {
            setVisible(false);
            return;
        }
        const t = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
        return () => clearTimeout(t);
    }, [mode]);

    const close = () => {
        snooze();
        setVisible(false);
    };

    return (
        <>
            {visible && (
                <div
                    role="dialog"
                    aria-label="Install ZverTs"
                    className="glass-bar glass-capsule fixed bottom-[calc(1rem+var(--app-bottom-inset))] left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-3xl border p-4 shadow-elevated animate-in fade-in slide-in-from-bottom-4"
                >
                    <div className="flex items-start gap-3">
                        <img
                            src="/android-chrome-192x192.png"
                            alt=""
                            className="h-12 w-12 shrink-0 rounded-2xl shadow-card"
                        />
                        <div className="min-w-0 flex-1">
                            <div className="font-semibold">Install ZverTs</div>
                            <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
                                Open it from your home screen like an app. It's faster and keeps
                                working offline.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={close}
                            aria-label="Not now"
                            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="mt-3 flex gap-2">
                        <Button variant="ghost" className="flex-1 rounded-full" onClick={close}>
                            Not now
                        </Button>
                        <Button
                            className="flex-1 rounded-full"
                            onClick={async () => {
                                setVisible(false);
                                await install();
                            }}
                        >
                            <Download className="mr-1.5 h-4 w-4" /> Install
                        </Button>
                    </div>
                </div>
            )}
            <IosInstallHelp open={iosHelp} onOpenChange={setIosHelp} />
        </>
    );
};

/** "Install ZverTs" in the menu; hidden where it can't be installed or already is. */
export const InstallMenuRow = ({ onDone }: { onDone?: () => void }) => {
    const { mode, install, iosHelp, setIosHelp } = useInstallAction();
    if (mode !== "prompt" && mode !== "ios") return null;
    return (
        <SettingsGroup>
            <SettingsNavRow
                icon={Smartphone}
                tint="bg-primary"
                title="Install ZverTs"
                subtitle="Add it to your home screen"
                onClick={async () => {
                    await install();
                    if (mode === "prompt") onDone?.();
                }}
            />
            <IosInstallHelp
                open={iosHelp}
                onOpenChange={(o) => {
                    setIosHelp(o);
                    if (!o) onDone?.();
                }}
            />
        </SettingsGroup>
    );
};

const IosInstallHelp = ({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100%-2rem)] rounded-3xl sm:max-w-sm">
            <DialogHeader>
                <DialogTitle>Install ZverTs on iPhone</DialogTitle>
                <DialogDescription>Two taps in Safari, then it opens like an app.</DialogDescription>
            </DialogHeader>
            <ol className="space-y-3 text-sm">
                {[
                    {
                        icon: Share,
                        text: (
                            <>
                                Tap <span className="font-semibold">Share</span> in Safari's toolbar.
                            </>
                        ),
                    },
                    {
                        icon: Plus,
                        text: (
                            <>
                                Choose <span className="font-semibold">Add to Home Screen</span>, then{" "}
                                <span className="font-semibold">Add</span>.
                            </>
                        ),
                    },
                    {
                        icon: WifiOff,
                        text: <>Open ZverTs from your home screen. It keeps working offline.</>,
                    },
                ].map((s, i) => (
                    <li key={i} className="flex items-start gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                            <s.icon className="h-4 w-4" />
                        </span>
                        <span className="pt-1.5">{s.text}</span>
                    </li>
                ))}
            </ol>
            <Button className="mt-2 w-full rounded-full" onClick={() => onOpenChange(false)}>
                Got it
            </Button>
        </DialogContent>
    </Dialog>
);
