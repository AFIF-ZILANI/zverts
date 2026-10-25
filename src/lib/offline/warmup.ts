// Offline warm-up: soon after ZverTs opens online, quietly load the pages a
// learner is likely to open later (their courses, every course's lessons,
// Growth, the leaderboard and Settings) so the service worker has a copy to show offline,
// even for pages never visited. At most once every few hours per user.
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
    fetchCourseDetail,
    fetchMyCourses,
    fetchSettingsData,
    notificationPrefsQuery,
} from "./queries";

const EVERY_MS = 6 * 3_600_000;
const MAX_COURSES = 40;
const key = (userId: string) => `zverts.offline-warmup:${userId}`;

const warm = async (userId: string) => {
    const courses = await fetchMyCourses(userId);
    // A few at a time, so it never competes with what the learner is doing.
    const queue = courses.slice(0, MAX_COURSES).map((c) => c.id);
    const worker = async () => {
        for (let id = queue.shift(); id; id = queue.shift()) await fetchCourseDetail(id, userId);
    };
    await Promise.all([
        worker(),
        worker(),
        // Growth and the leaderboard, asked exactly as those pages ask.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase.rpc("get_today_mission" as any),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase.rpc("get_growth_stats" as any),
        supabase.rpc("list_public_profiles", { _limit: 100 }),
        fetchSettingsData(userId),
        notificationPrefsQuery(userId),
    ]);
};

export const OfflineWarmup = () => {
    const { user } = useAuth();
    useEffect(() => {
        // Only worth it with a service worker to keep the copies, and only online.
        if (!user || !navigator.onLine || !navigator.serviceWorker?.controller) return;
        let last = 0;
        try {
            last = Number(localStorage.getItem(key(user.id)) ?? 0);
        } catch {
            /* storage unavailable: warm up anyway */
        }
        if (Date.now() - last < EVERY_MS) return;

        let cancelled = false;
        const start = () => {
            if (cancelled || !navigator.onLine) return;
            warm(user.id)
                .then(() => {
                    try {
                        localStorage.setItem(key(user.id), String(Date.now()));
                    } catch {
                        /* ignore */
                    }
                })
                .catch(() => {});
        };
        // After the current page has loaded, when the browser is idle.
        const t = setTimeout(() => {
            if ("requestIdleCallback" in window)
                window.requestIdleCallback(start, { timeout: 10_000 });
            else start();
        }, 5000);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [user]);
    return null;
};
