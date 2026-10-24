import { beforeEach, describe, expect, it, vi } from "vitest";
import { firstUnwatched, positionKey, resumePoint } from "./videoResume";

describe("firstUnwatched", () => {
    it("is the end of the range that starts the video", () => {
        expect(firstUnwatched("{[0,120),[300,410)}")).toBe(120);
        expect(firstUnwatched("{[300,410),[0,95)}")).toBe(95);
    });
    it("is 0 when nothing (or not the start) was watched", () => {
        expect(firstUnwatched(null)).toBe(0);
        expect(firstUnwatched("{}")).toBe(0);
        expect(firstUnwatched("{[40,90)}")).toBe(0);
    });
});

describe("resumePoint", () => {
    beforeEach(() => {
        // Node 26's own localStorage global shadows jsdom's; use a plain in-memory one.
        const store = new Map<string, string>();
        vi.stubGlobal("localStorage", {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, v),
            clear: () => store.clear(),
        });
    });
    it("prefers the position saved on this device", () => {
        localStorage.setItem(positionKey("m1"), "212");
        expect(resumePoint("m1", "{[0,120)}", 600)).toBe(212);
    });
    it("falls back to the first unwatched second", () => {
        expect(resumePoint("m1", "{[0,120)}", 600)).toBe(120);
    });
    it("starts over near the end", () => {
        localStorage.setItem(positionKey("m1"), "590");
        expect(resumePoint("m1", null, 600)).toBe(0);
    });
    it("keeps the position when the duration is unknown", () => {
        localStorage.setItem(positionKey("m1"), "590");
        expect(resumePoint("m1", null, 0)).toBe(590);
    });
});
