import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { YouTubePlayer, type WatchReport } from "./YouTubePlayer";

// Fake YouTube IFrame API player whose clock we drive by hand.
const fake = {
    state: -1,
    time: 0,
    rate: 1,
    duration: 600,
    onStateChange: (_e: { data: number }) => {},
};

class FakePlayer {
    constructor(_el: HTMLElement, opts: { events: { onStateChange: (e: { data: number }) => void } }) {
        fake.onStateChange = opts.events.onStateChange;
    }
    getCurrentTime = () => fake.time;
    getDuration = () => fake.duration;
    getPlayerState = () => fake.state;
    getPlaybackRate = () => fake.rate;
    seekTo = (s: number) => {
        fake.time = s;
    };
    playVideo() {}
    pauseVideo() {}
    destroy() {}
    isMuted = () => false;
    mute() {}
    unMute() {}
}

const setState = (state: number) => {
    fake.state = state;
    act(() => fake.onStateChange({ data: state }));
};

/** Advance real time by `seconds` while the video plays at `fake.rate`. */
const play = (seconds: number) => {
    for (let i = 0; i < seconds; i++) {
        fake.time += fake.rate;
        act(() => vi.advanceTimersByTime(1000));
    }
};

const totals = (reports: WatchReport[]) => ({
    watched: reports.reduce((s, r) => s + r.watchedSeconds, 0),
    segments: reports.flatMap((r) => r.segments),
});

describe("YouTubePlayer watch tracking", () => {
    let reports: WatchReport[];
    let unmount: () => void;

    beforeEach(async () => {
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "performance"] });
        Object.assign(fake, { state: -1, time: 0, rate: 1, duration: 600 });
        (window as unknown as { YT: unknown }).YT = { Player: FakePlayer };
        reports = [];
        ({ unmount } = render(<YouTubePlayer videoId="abc" onWatch={(r) => reports.push(r)} />));
        await act(async () => {}); // let the YT loader promise resolve
        setState(1);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("counts normal playback as watch time and progress", () => {
        play(25);
        setState(2);
        const t = totals(reports);
        expect(t.watched).toBeCloseTo(25, 0);
        expect(t.segments[0][0]).toBe(0);
        expect(t.segments.at(-1)![1]).toBe(25);
        expect(reports[0].duration).toBe(600);
    });

    it("does not count a seek ahead as watched", () => {
        play(10);
        fake.time = 400; // user drags the timeline to 6:40
        play(10);
        setState(2);
        const t = totals(reports);
        // The one tick that spans the seek is dropped, so ~19 of the 20 real seconds count.
        expect(t.watched).toBeGreaterThanOrEqual(18);
        expect(t.watched).toBeLessThanOrEqual(20);
        const covered = t.segments.reduce((s, [a, b]) => s + (b - a), 0);
        expect(covered).toBeLessThanOrEqual(20);
        expect(t.segments.some(([a, b]) => a < 400 && b > 10)).toBe(false);
    });

    it("counts real time, not video time, at 2x speed", () => {
        fake.rate = 2;
        play(10);
        setState(2);
        const t = totals(reports);
        expect(t.watched).toBeCloseTo(10, 0); // 10 real seconds spent
        expect(t.segments.at(-1)![1]).toBe(20); // but 20s of the video covered
    });

    it("stops counting while the tab is hidden", () => {
        play(5);
        const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        act(() => document.dispatchEvent(new Event("visibilitychange")));
        play(30);
        visibility.mockReturnValue("visible");
        setState(2);
        expect(totals(reports).watched).toBeLessThanOrEqual(6);
        visibility.mockRestore();
    });

    it("sends pending watch time when the player unmounts", () => {
        play(4);
        expect(reports).toHaveLength(0);
        unmount();
        expect(totals(reports).watched).toBeCloseTo(4, 0);
    });
});
