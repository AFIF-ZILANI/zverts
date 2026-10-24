import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpenText, ExternalLink, Loader2, Mic, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import data from "@/lib/islamic/ayat.json";
import {
    audioUrl,
    ayahForSlot,
    isNightSlot,
    nextChange,
    reciterOf,
    rotation,
    slotIndex,
    TRANSLATIONS,
    useIslamicSettings,
    type Ayah,
} from "@/lib/islamic/dailyAyah";

const order = rotation(data.ayat as Ayah[]);

// Amiri Quran renders the Uthmani text (small high letters, pause marks)
// correctly; load it only when this card is shown.
const QURAN_FONT = "https://fonts.googleapis.com/css2?family=Amiri+Quran&display=swap";
const useQuranFont = () =>
    useEffect(() => {
        if (document.querySelector(`link[href="${QURAN_FONT}"]`)) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = QURAN_FONT;
        document.head.appendChild(link);
    }, []);

// Re-render when the 9 AM / 9 PM slot changes while the page stays open.
const useSlot = () => {
    const [slot, setSlot] = useState(() => slotIndex());
    useEffect(() => {
        const t = setTimeout(
            () => setSlot(slotIndex()),
            nextChange().getTime() - Date.now() + 1000,
        );
        return () => clearTimeout(t);
    }, [slot]);
    return slot;
};

/** Islamic Mode's Daily Ayah: one ayah from 9 AM, another from 9 PM (Bangladesh time). */
export const DailyAyahCard = () => {
    useQuranFont();
    const [settings] = useIslamicSettings();
    const slot = useSlot();
    const ayah = useMemo(() => ayahForSlot(order, slot), [slot]);
    const reciter = reciterOf(settings.reciter);
    const translation = settings.translation === "en" ? ayah.en : ayah.bn;

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [audio, setAudio] = useState<"idle" | "loading" | "playing">("idle");

    // A new ayah or reciter: stop whatever was playing.
    useEffect(() => {
        return () => {
            audioRef.current?.pause();
            audioRef.current = null;
            setAudio("idle");
        };
    }, [ayah.number, reciter.id]);

    const toggleAudio = () => {
        if (audio !== "idle") {
            audioRef.current?.pause();
            setAudio("idle");
            return;
        }
        const el = audioRef.current ?? new Audio(audioUrl(ayah.number, reciter.id));
        audioRef.current = el;
        el.onplaying = () => setAudio("playing");
        el.onended = () => setAudio("idle");
        el.onerror = () => {
            setAudio("idle");
            toast.error("Couldn't play the recitation. Check your connection.");
        };
        setAudio("loading");
        el.play().catch(() => setAudio("idle"));
    };

    const night = isNightSlot();
    const ref = `${ayah.surah}:${ayah.ayah}`;

    return (
        <section
            aria-label="Daily Ayah"
            className="rounded-2xl border border-border bg-gradient-card p-5 md:p-6 shadow-card"
        >
            <div className="flex items-center gap-2">
                <BookOpenText className="h-5 w-5 text-primary" />
                <h2 className="font-sans text-base font-semibold text-primary tracking-normal">
                    Daily Ayah
                </h2>
                <span className="text-xs font-mono text-muted-foreground">
                    · {night ? "Night" : "Day"}
                </span>
                <div className="ml-auto flex items-center gap-1">
                    <a
                        href={`https://quran.com/${ayah.surah}/${ayah.ayah}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Read in context on Quran.com"
                        aria-label="Read in context on Quran.com"
                        className="h-9 w-9 inline-flex items-center justify-center rounded-full text-primary hover:bg-primary/10 transition-colors"
                    >
                        <ExternalLink className="h-[18px] w-[18px]" />
                    </a>
                    <button
                        type="button"
                        onClick={toggleAudio}
                        title={audio === "idle" ? `Listen — ${reciter.name}` : "Stop"}
                        aria-label={audio === "idle" ? "Play recitation" : "Stop recitation"}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-full text-primary hover:bg-primary/10 transition-colors"
                    >
                        {audio === "loading" ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : audio === "playing" ? (
                            <Pause className="h-5 w-5" />
                        ) : (
                            <Play className="h-5 w-5" />
                        )}
                    </button>
                </div>
            </div>

            <p
                lang="ar"
                dir="rtl"
                className="mt-4 text-right text-2xl md:text-3xl leading-[2.1] text-foreground"
                style={{ fontFamily: '"Amiri Quran", "Scheherazade New", serif' }}
            >
                {ayah.ar}
            </p>

            <p
                lang={settings.translation}
                className="mt-3 text-[15px] md:text-base leading-relaxed text-foreground/90"
            >
                {translation}
            </p>

            <div className="mt-4 flex items-end justify-between gap-3 text-sm text-muted-foreground">
                <span className="font-medium">
                    Surah {ayah.surahName} ({ref})
                </span>
                <span className="inline-flex min-w-0 items-center gap-1.5 text-xs">
                    <Mic className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{reciter.name}</span>
                </span>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground/70">
                Translation: {TRANSLATIONS.find((t) => t.id === settings.translation)?.credit}
            </p>
        </section>
    );
};

export default DailyAyahCard;
