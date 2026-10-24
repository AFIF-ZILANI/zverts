import { useEffect, useRef } from "react";

const SNAP = "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)";

/**
 * Scroll-linked bottom bar (the Chrome / Safari toolbar behaviour): while
 * scrolling down the bar slides out pixel for pixel with the page, scrolling
 * up pulls it straight back. When scrolling stops it finishes the move in the
 * direction of the gesture, so a short flick is enough to hide or show it. Always shown at the top and bottom of the page, when
 * disabled, and after `resetKey` changes (a new route).
 *
 * Writes the transform straight to the element — no React render per frame.
 * Attach the returned ref to the bar.
 */
export const useHideOnScroll = <T extends HTMLElement>(enabled: boolean, resetKey?: unknown) => {
    const ref = useRef<T>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let offset = 0; // px slid out of view, 0 … bar height
        const place = (px: number, animate: boolean) => {
            offset = px;
            el.style.transition = animate ? SNAP : "none";
            el.style.transform = px ? `translate3d(0, ${px}px, 0)` : "";
        };
        place(0, true);
        if (!enabled) return;

        let last = window.scrollY;
        let frame = 0;
        let settle: ReturnType<typeof setTimeout> | undefined;
        let gesture = 0; // px scrolled since scrolling started (+ down, − up)
        const update = () => {
            frame = 0;
            const y = window.scrollY;
            const bottom = document.documentElement.scrollHeight - window.innerHeight;
            const delta = y - last;
            last = y;
            gesture += delta;
            // Its height plus the gap below a floating bar (and a little for the shadow).
            const h = el.offsetHeight + (parseFloat(getComputedStyle(el).bottom) || 0) + 8;
            // Top (incl. iOS overscroll) and the end of the page: show it.
            if (y <= 0 || y >= bottom - 2) {
                gesture = 0;
                if (offset) place(0, true);
                return;
            }
            // Near the top the bar can't be hidden further than the page has
            // scrolled, so it eases back in as the top is reached.
            const next = Math.min(h, Math.max(0, offset + delta), y);
            if (next !== offset) place(next, false);
            clearTimeout(settle);
            settle = setTimeout(() => {
                // A deliberate move (6px+) goes all the way; a tiny wobble snaps back.
                const hide = Math.abs(gesture) >= 6 ? gesture > 0 : offset > h / 2;
                gesture = 0;
                const target = hide ? Math.min(h, window.scrollY) : 0;
                if (target !== offset) place(target, true);
            }, 90);
        };
        const onScroll = () => {
            if (!frame) frame = requestAnimationFrame(update);
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", onScroll);
            cancelAnimationFrame(frame);
            clearTimeout(settle);
            place(0, false);
        };
    }, [enabled, resetKey]);

    return ref;
};
