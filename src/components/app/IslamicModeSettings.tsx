import { Languages, Mic, MoonStar } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    RECITERS,
    TRANSLATIONS,
    useIslamicSettings,
    type ReciterId,
    type TranslationId,
} from "@/lib/islamic/dailyAyah";

/** Settings → Islamic Mode: the Daily Ayah on the dashboard, its reciter and translation. */
export const IslamicModeSettings = () => {
    const [s, update] = useIslamicSettings();
    return (
        <div className="rounded-2xl border border-border bg-gradient-card p-6 md:p-8 shadow-card space-y-5">
            <div className="flex items-start gap-4">
                <MoonStar className="h-5 w-5 mt-0.5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="font-medium">Islamic Mode</div>
                    <p className="text-sm text-muted-foreground">
                        Show a Daily Ayah on your dashboard — a new one at 9 AM and at 9 PM.
                    </p>
                </div>
                <Switch
                    checked={s.enabled}
                    onCheckedChange={(v) => update({ enabled: v })}
                    aria-label="Islamic Mode"
                />
            </div>

            {s.enabled && (
                <div className="border-t border-border pt-5 space-y-4">
                    <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                        Daily Ayah preferences
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <Mic className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0 text-sm font-medium">Reciter</div>
                        <Select
                            value={s.reciter}
                            onValueChange={(v) => update({ reciter: v as ReciterId })}
                        >
                            <SelectTrigger className="w-full sm:w-[260px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {RECITERS.map((r) => (
                                    <SelectItem key={r.id} value={r.id}>
                                        {r.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <Languages className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0 text-sm font-medium">
                            Translation language
                        </div>
                        <Select
                            value={s.translation}
                            onValueChange={(v) => update({ translation: v as TranslationId })}
                        >
                            <SelectTrigger className="w-full sm:w-[260px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TRANSLATIONS.map((t) => (
                                    <SelectItem key={t.id} value={t.id}>
                                        {t.name} — {t.credit}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Quran text (Uthmani) and translations exactly as published, via
                        alquran.cloud; recitations from Islamic Network.
                    </p>
                </div>
            )}
        </div>
    );
};
