import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

interface YTPlayer {
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    getPlaybackRate(): number;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    playVideo(): void;
    pauseVideo(): void;
    destroy(): void;
    isMuted(): boolean;
    mute(): void;
    unMute(): void;
}

declare global {
    interface Window {
        YT: { Player: new (container: HTMLElement, options: Record<string, unknown>) => YTPlayer };
        onYouTubeIframeAPIReady?: () => void;
    }
}

/** Genuine viewing since the previous report. */
export type WatchReport = {
    /** Real seconds spent with the video playing (seeks and skips excluded). */
    watchedSeconds: number;
    /** Video-time ranges [start, end] that actually played. */
    segments: [number, number][];
    /** Video length in seconds as reported by the player. */
    duration: number;
};

interface Props {
    videoId: string;
    onWatch: (report: WatchReport) => void;
}

export type YouTubePlayerHandle = {
    getCurrentTime: () => number;
    seekTo: (seconds: number) => void;
};

const TICK_MS = 1000;
// Send accumulated watch time to the server roughly this often while playing.
const REPORT_EVERY_SECONDS = 5;

let ytApiPromise: Promise<void> | null = null;
const loadYT = () => {
    if (ytApiPromise) return ytApiPromise;
    ytApiPromise = new Promise((resolve) => {
        if (window.YT?.Player) return resolve();
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
        window.onYouTubeIframeAPIReady = () => resolve();
    });
    return ytApiPromise;
};

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, Props>(({ videoId, onWatch }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<YTPlayer | null>(null);
    const onWatchRef = useRef(onWatch);
    onWatchRef.current = onWatch;

    // Last sample taken while genuinely playing; null after a pause/seek/hidden tab.
    const lastSampleRef = useRef<{ wall: number; pos: number } | null>(null);
    const pendingRef = useRef<{ watched: number; segments: [number, number][] }>({
        watched: 0,
        segments: [],
    });

    useImperativeHandle(
        ref,
        () => ({
            getCurrentTime: () => playerRef.current?.getCurrentTime?.() ?? 0,
            seekTo: (s: number) => {
                try {
                    playerRef.current?.seekTo?.(s, true);
                    playerRef.current?.playVideo?.();
                } catch {
                    /* seekTo errors are non-critical */
                }
            },
        }),
        [],
    );

    const flush = useCallback(() => {
        const pending = pendingRef.current;
        if (pending.watched <= 0 && pending.segments.length === 0) return;
        const duration = playerRef.current?.getDuration?.() ?? 0;
        pendingRef.current = { watched: 0, segments: [] };
        onWatchRef.current({
            watchedSeconds: Math.round(pending.watched * 10) / 10,
            segments: pending.segments,
            duration: Math.round(duration),
        });
    }, []);

    // Sample the player. Time counts only when the video advanced the way normal
    // playback would (≈ elapsed × playback rate); a jump means the user seeked, and
    // the skipped part is neither watch time nor progress.
    const sample = useCallback(() => {
        const player = playerRef.current;
        if (!player?.getPlayerState) return;
        const now = performance.now();
        const pos = player.getCurrentTime?.() ?? 0;
        const playing = player.getPlayerState() === 1 && document.visibilityState === "visible";
        const prev = lastSampleRef.current;
        lastSampleRef.current = playing ? { wall: now, pos } : null;
        // Still credit the stretch since the last sample when playback just paused/ended.
        if (!prev) return;

        const wallDelta = (now - prev.wall) / 1000;
        const posDelta = pos - prev.pos;
        const rate = player.getPlaybackRate?.() || 1;
        const isNormalPlayback =
            wallDelta > 0 && wallDelta <= 3 && posDelta > 0 && posDelta <= wallDelta * rate + 1;
        if (!isNormalPlayback) return;

        const pending = pendingRef.current;
        pending.watched += wallDelta;
        const last = pending.segments[pending.segments.length - 1];
        if (last && Math.abs(last[1] - prev.pos) < 0.01) last[1] = pos;
        else pending.segments.push([prev.pos, pos]);

        if (pending.watched >= REPORT_EVERY_SECONDS) flush();
    }, [flush]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!playerRef.current) return;
        const target = e.target as HTMLElement;
        const tag = target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || target.isContentEditable) return;
        // Monaco (code runner) types through an EditContext div, not a textarea.
        if (target.closest?.(".monaco-editor")) return;

        switch (e.key) {
            case " ":
            case "k":
            case "K": {
                e.preventDefault();
                const state = playerRef.current.getPlayerState?.();
                if (state === 1) playerRef.current.pauseVideo?.();
                else playerRef.current.playVideo?.();
                break;
            }
            case "ArrowLeft":
                e.preventDefault();
                playerRef.current.seekTo?.(Math.max(0, (playerRef.current.getCurrentTime?.() ?? 0) - 5), true);
                break;
            case "ArrowRight":
                e.preventDefault();
                playerRef.current.seekTo?.((playerRef.current.getCurrentTime?.() ?? 0) + 5, true);
                break;
            case "m":
            case "M":
                e.preventDefault();
                if (playerRef.current.isMuted?.()) playerRef.current.unMute?.();
                else playerRef.current.mute?.();
                break;
        }
    }, []);

    useEffect(() => {
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    // Hidden tab: stop counting and send what was watched so far.
    useEffect(() => {
        const onVisibility = () => {
            sample();
            if (document.visibilityState === "hidden") flush();
        };
        document.addEventListener("visibilitychange", onVisibility);
        return () => document.removeEventListener("visibilitychange", onVisibility);
    }, [sample, flush]);

    useEffect(() => {
        let cancelled = false;
        const interval = window.setInterval(sample, TICK_MS);
        lastSampleRef.current = null;
        pendingRef.current = { watched: 0, segments: [] };

        loadYT().then(() => {
            if (cancelled || !containerRef.current) return;
            playerRef.current = new window.YT.Player(containerRef.current, {
                videoId,
                playerVars: {
                    rel: 0, // no related-videos from other channels
                    modestbranding: 1, // minimal YouTube branding
                    playsinline: 1,
                    iv_load_policy: 3, // hide video annotations
                    cc_load_policy: 0,
                    fs: 1,
                    origin: window.location.origin,
                    enablejsapi: 1,
                },
                events: {
                    onStateChange: (e: { data: number }) => {
                        // 1 = playing, 2 = paused, 0 = ended, 3 = buffering
                        sample();
                        if (e.data === 2 || e.data === 0) flush();
                    },
                },
            });
        });
        return () => {
            cancelled = true;
            window.clearInterval(interval);
            sample();
            flush();
            try {
                playerRef.current?.destroy?.();
            } catch {
                /* player destroy errors are non-critical */
            }
            playerRef.current = null;
        };
    }, [videoId, sample, flush]);

    return (
        <div className="aspect-video rounded-xl overflow-hidden border border-border bg-black shadow-elevated">
            <div ref={containerRef} className="w-full h-full" />
        </div>
    );
});
YouTubePlayer.displayName = "YouTubePlayer";
