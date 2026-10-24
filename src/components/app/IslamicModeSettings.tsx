import { Languages, Mic } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { SettingsGroup, SettingsRow } from "@/components/app/settings/SettingsUI";
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
        <>
            <SettingsGroup footer="A new ayah at 9 AM and at 9 PM, Bangladesh time. Saved on this device.">
                <SettingsRow
                    title="Islamic Mode"
                    description="Show a Daily Ayah on your dashboard."
                    control={
                        <Switch
                            checked={s.enabled}
                            onCheckedChange={(v) => update({ enabled: v })}
                            aria-label="Islamic Mode"
                        />
                    }
                />
            </SettingsGroup>

            {s.enabled && (
                <SettingsGroup
                    title="Daily Ayah preferences"
                    footer="Quran text (Uthmani) and translations exactly as published, via alquran.cloud; recitations from Islamic Network."
                >
                    <SettingsRow
                        icon={Mic}
                        title="Reciter"
                        stack
                        control={
                            <Select
                                value={s.reciter}
                                onValueChange={(v) => update({ reciter: v as ReciterId })}
                            >
                                <SelectTrigger>
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
                        }
                    />
                    <SettingsRow
                        icon={Languages}
                        title="Translation language"
                        stack
                        control={
                            <Select
                                value={s.translation}
                                onValueChange={(v) => update({ translation: v as TranslationId })}
                            >
                                <SelectTrigger>
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
                        }
                    />
                </SettingsGroup>
            )}
        </>
    );
};
