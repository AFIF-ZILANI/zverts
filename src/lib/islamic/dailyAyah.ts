// Islamic Mode: one ayah for the day (from 9 AM) and one for the night (from
// 9 PM), Bangladesh time. The ayat and their texts live in ayat.json, generated
// from api.alquran.cloud by scripts/fetch-daily-ayat.mjs — never typed by hand.
import { useEffect, useState } from "react";

export type Ayah = {
    ref: string;
    kind: "motivational" | "general";
    surah: number;
    ayah: number;
    surahName: string;
    number: number;
    ar: string;
    bn: string;
    en: string;
};

// ── Schedule ──

const HOUR = 3_600_000;
const DHAKA_OFFSET = 6 * HOUR; // UTC+6, no daylight saving
const FIRST_SLOT_HOUR = 9; // slots change at 09:00 and 21:00 Dhaka time
const SLOT = 12 * HOUR;

/** Which 12-hour slot `now` falls in (the same for everyone at the same moment). */
export const slotIndex = (now = Date.now()) =>
    Math.floor((now + DHAKA_OFFSET - FIRST_SLOT_HOUR * HOUR) / SLOT);

/** When the next ayah appears. */
export const nextChange = (now = Date.now()) =>
    new Date((slotIndex(now) + 1) * SLOT - DHAKA_OFFSET + FIRST_SLOT_HOUR * HOUR);

export const isNightSlot = (now = Date.now()) => slotIndex(now) % 2 !== 0;

// Motivational ayat appear three times as often as the rest.
const MOTIVATIONAL_WEIGHT = 3;

// Small seeded PRNG so the rotation is the same on every device.
const mulberry32 = (seed: number) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** The repeating order of ayat: weighted, shuffled, no ayah twice in a row. */
export const rotation = (ayat: Ayah[]): Ayah[] => {
    const list = ayat.flatMap((a) =>
        Array<Ayah>(a.kind === "motivational" ? MOTIVATIONAL_WEIGHT : 1).fill(a),
    );
    const rand = mulberry32(2026);
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    // Break up neighbours that are the same ayah (including across the wrap).
    for (let i = 0; i < list.length; i++) {
        const next = (i + 1) % list.length;
        if (list[i].ref !== list[next].ref) continue;
        const k = list.findIndex(
            (a, idx) =>
                a.ref !== list[i].ref &&
                list[(idx + 1) % list.length].ref !== list[next].ref &&
                list[(idx - 1 + list.length) % list.length].ref !== list[next].ref,
        );
        if (k >= 0) [list[next], list[k]] = [list[k], list[next]];
    }
    return list;
};

export const ayahForSlot = (order: Ayah[], slot: number) =>
    order[((slot % order.length) + order.length) % order.length];

// ── Reciters (per-ayah audio from the Islamic Network CDN) ──

export const RECITERS = [
    { id: "ar.alafasy", name: "Mishary Rashid Al Afasy", bitrate: 128 },
    { id: "ar.abdulbasitmurattal", name: "Abdul Basit Abdus Samad", bitrate: 64 },
    { id: "ar.abdurrahmaansudais", name: "Abdur-Rahman As-Sudais", bitrate: 64 },
    { id: "ar.husary", name: "Mahmoud Khalil Al-Husary", bitrate: 128 },
    { id: "ar.minshawi", name: "Mohamed Siddiq Al-Minshawi", bitrate: 128 },
    { id: "ar.mahermuaiqly", name: "Maher Al Muaiqly", bitrate: 128 },
] as const;
export type ReciterId = (typeof RECITERS)[number]["id"];

export const reciterOf = (id: string) => RECITERS.find((r) => r.id === id) ?? RECITERS[0];

export const audioUrl = (ayahNumber: number, reciterId: string) => {
    const r = reciterOf(reciterId);
    return `https://cdn.islamic.network/quran/audio/${r.bitrate}/${r.id}/${ayahNumber}.mp3`;
};

export const TRANSLATIONS = [
    { id: "bn", name: "বাংলা", credit: "মুহিউদ্দীন খান" },
    { id: "en", name: "English", credit: "Saheeh International" },
] as const;
export type TranslationId = (typeof TRANSLATIONS)[number]["id"];

// ── Settings (per device) ──

export type IslamicSettings = { enabled: boolean; reciter: ReciterId; translation: TranslationId };

const KEY = "zverts.islamic";
const CHANGE = "zverts:islamic-settings";
const DEFAULTS: IslamicSettings = { enabled: false, reciter: "ar.alafasy", translation: "bn" };

const read = (): IslamicSettings => {
    try {
        const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
        return {
            enabled: v.enabled === true,
            reciter: RECITERS.some((r) => r.id === v.reciter) ? v.reciter : DEFAULTS.reciter,
            translation: v.translation === "en" ? "en" : "bn",
        };
    } catch {
        return DEFAULTS;
    }
};

/** Islamic Mode settings, kept in sync between Settings and the Dashboard (and tabs). */
export const useIslamicSettings = () => {
    const [settings, setSettings] = useState(read);
    useEffect(() => {
        const sync = () => setSettings(read());
        window.addEventListener(CHANGE, sync);
        window.addEventListener("storage", sync);
        return () => {
            window.removeEventListener(CHANGE, sync);
            window.removeEventListener("storage", sync);
        };
    }, []);
    const update = (patch: Partial<IslamicSettings>) => {
        const next = { ...read(), ...patch };
        try {
            localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
            /* storage unavailable: the change lasts for this page only */
        }
        setSettings(next);
        window.dispatchEvent(new Event(CHANGE));
    };
    return [settings, update] as const;
};
