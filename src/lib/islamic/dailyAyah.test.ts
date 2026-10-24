import { describe, expect, it } from "vitest";
import data from "./ayat.json";
import {
    audioUrl,
    ayahForSlot,
    isNightSlot,
    nextChange,
    rotation,
    slotIndex,
    type Ayah,
} from "./dailyAyah";

const ayat = data.ayat as Ayah[];
// Dhaka is UTC+6: 09:00 Dhaka = 03:00 UTC, 21:00 Dhaka = 15:00 UTC.
const utc = (iso: string) => Date.parse(`${iso}Z`);

describe("schedule", () => {
    it("changes at 9 AM and 9 PM Bangladesh time", () => {
        const morning = slotIndex(utc("2026-10-25T03:00:00"));
        expect(slotIndex(utc("2026-10-25T02:59:59"))).toBe(morning - 1);
        expect(slotIndex(utc("2026-10-25T14:59:59"))).toBe(morning);
        expect(slotIndex(utc("2026-10-25T15:00:00"))).toBe(morning + 1);
    });
    it("knows day from night and when the next ayah comes", () => {
        expect(isNightSlot(utc("2026-10-25T05:00:00"))).toBe(false); // 11 AM Dhaka
        expect(isNightSlot(utc("2026-10-25T17:00:00"))).toBe(true); // 11 PM Dhaka
        expect(nextChange(utc("2026-10-25T05:00:00")).toISOString()).toBe(
            "2026-10-25T15:00:00.000Z",
        );
    });
});

describe("rotation", () => {
    const order = rotation(ayat);
    it("weights motivational ayat 3:1", () => {
        const mot = ayat.filter((a) => a.kind === "motivational").length;
        const gen = ayat.length - mot;
        expect(order.length).toBe(mot * 3 + gen);
        const shown = order.filter((a) => a.kind === "motivational").length / order.length;
        expect(shown).toBeGreaterThan(0.8);
    });
    it("never shows the same ayah twice in a row", () => {
        for (let i = 0; i < order.length; i++) {
            expect(order[i].ref).not.toBe(order[(i + 1) % order.length].ref);
        }
    });
    it("is the same on every run (same ayah for everyone)", () => {
        expect(rotation(ayat).map((a) => a.ref)).toEqual(order.map((a) => a.ref));
        expect(ayahForSlot(order, -3)).toBeDefined();
    });
});

describe("data", () => {
    it("has Arabic and both translations for every ayah, without the added Basmala", () => {
        for (const a of ayat) {
            expect(a.ar && a.bn && a.en).toBeTruthy();
            if (a.ayah === 1 && a.surah !== 1 && a.surah !== 9)
                expect(a.ar.startsWith("بِسْمِ")).toBe(false);
        }
    });
    it("builds the per-ayah audio URL", () => {
        expect(audioUrl(5986, "ar.alafasy")).toBe(
            "https://cdn.islamic.network/quran/audio/128/ar.alafasy/5986.mp3",
        );
        expect(audioUrl(5986, "ar.abdurrahmaansudais")).toContain("/64/");
    });
});
