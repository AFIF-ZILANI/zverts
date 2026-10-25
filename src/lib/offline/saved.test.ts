import { describe, expect, it, vi } from "vitest";
import { friendlyError, isOfflineError, recall, remember } from "./saved";

// Node's own localStorage stub can shadow jsdom's and store nothing.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
});

describe("saved", () => {
    it("remembers per user and recalls it back", () => {
        remember("u1", "dashboard", { a: 1 });
        expect(recall<{ a: number }>("u1", "dashboard")?.data).toEqual({ a: 1 });
        expect(recall("u2", "dashboard")).toBeNull();
    });

    it("tells network errors from real ones", () => {
        expect(isOfflineError(new TypeError("Failed to fetch"))).toBe(true);
        expect(isOfflineError(new Error("permission denied"))).toBe(false);
        expect(friendlyError(new Error("permission denied"))).toBe("permission denied");
        expect(friendlyError(new TypeError("Load failed"))).toMatch(/offline/);
    });
});
