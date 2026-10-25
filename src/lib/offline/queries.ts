// Reads shared by pages and the offline warm-up (warmup.ts). The service worker
// keeps the last answer per request URL, so the warm-up only helps if it asks
// exactly what the page will ask: keep both on these functions.
import { supabase } from "@/integrations/supabase/client";

/** Courses → My courses, each with its module count and how many are completed. */
export const fetchMyCourses = async (userId: string) => {
    const { data: courses } = await supabase
        .from("courses")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
    if (!courses?.length) return [];

    const { data: mods } = await supabase
        .from("modules")
        .select("id,course_id")
        .in(
            "course_id",
            courses.map((c) => c.id),
        );
    const modIds = (mods ?? []).map((m) => m.id);
    const { data: prog } = modIds.length
        ? await supabase
              .from("module_progress")
              .select("module_id,completed")
              .eq("user_id", userId)
              .in("module_id", modIds)
        : { data: [] as { module_id: string; completed: boolean }[] };

    const modsByCourse = new Map<string, string[]>();
    (mods ?? []).forEach((m) => {
        const arr = modsByCourse.get(m.course_id) ?? [];
        arr.push(m.id);
        modsByCourse.set(m.course_id, arr);
    });
    const completed = new Set((prog ?? []).filter((p) => p.completed).map((p) => p.module_id));
    return courses.map((c) => ({
        ...c,
        module_count: modsByCourse.get(c.id)?.length ?? 0,
        completed_count: (modsByCourse.get(c.id) ?? []).filter((mid) => completed.has(mid)).length,
    }));
};

/** Course detail: the course, its modules and the user's progress on them. */
export const fetchCourseDetail = async (id: string, userId: string | undefined) => {
    const [{ data: course }, { data: modules }] = await Promise.all([
        supabase.from("courses").select("*").eq("id", id).maybeSingle(),
        supabase
            .from("modules")
            .select("id,position,title,duration_seconds,youtube_video_id,thumbnail_url")
            .eq("course_id", id)
            .order("position"),
    ]);
    let progress: { module_id: string; percent_watched: number; completed: boolean }[] = [];
    if (userId && modules?.length) {
        const { data } = await supabase
            .from("module_progress")
            .select("module_id,percent_watched,completed")
            .eq("user_id", userId)
            .in(
                "module_id",
                modules.map((m) => m.id),
            );
        progress = data ?? [];
    }
    return { course, modules: modules ?? [], progress };
};

/** Settings: profile, preferences and progress. */
export const fetchSettingsData = (userId: string) =>
    Promise.all([
        supabase
            .from("profiles")
            .select("name,email,avatar_url,certificate_name,preferred_language")
            .eq("id", userId)
            .maybeSingle(),
        supabase
            .from("user_preferences")
            .select(
                "daily_goal_minutes,study_reminders_enabled,notify_email,notify_inactivity,notify_completion,profile_public",
            )
            .eq("user_id", userId)
            .maybeSingle(),
        supabase
            .from("user_progress")
            .select("total_gems,total_xp,current_streak,longest_streak")
            .eq("user_id", userId)
            .maybeSingle(),
    ]);

/** Settings → Notifications. */
export const notificationPrefsQuery = (userId: string) =>
    supabase
        .from("notification_preferences")
        .select(
            "mute_all,study_reminders,system_alerts,gamification,comeback,max_per_day,quiet_hours_start,quiet_hours_end",
        )
        .eq("user_id", userId)
        .maybeSingle();
