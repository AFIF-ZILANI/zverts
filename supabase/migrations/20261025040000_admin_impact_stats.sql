-- ZverTs Impact (admin): platform-wide totals for courses, watch time and what
-- learners have achieved. RLS keeps these tables per-user, so the admin page
-- reads them through this one SECURITY DEFINER function.
-- Days and weeks follow Bangladesh time, like watch_daily and the daily mission.
CREATE OR REPLACE FUNCTION public.admin_impact_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'Asia/Dhaka')::date;
  _result jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'courses', (SELECT count(*) FROM courses WHERE NOT is_system),
    'course_creators', (SELECT count(DISTINCT user_id) FROM courses WHERE NOT is_system),
    'videos', (SELECT count(*) FROM modules m JOIN courses c ON c.id = m.course_id WHERE NOT c.is_system),
    'content_seconds', (SELECT COALESCE(sum(m.duration_seconds), 0) FROM modules m JOIN courses c ON c.id = m.course_id WHERE NOT c.is_system),
    'watch_seconds', (SELECT COALESCE(sum(watch_time_seconds), 0) FROM module_progress),
    'watch_seconds_7d', (SELECT COALESCE(sum(seconds), 0) FROM watch_daily WHERE date > _today - 7),
    'modules_completed', (SELECT count(*) FROM module_progress WHERE completed),
    'certificates', (SELECT count(*) FROM certificates),
    'badges', (SELECT count(*) FROM achievements),
    'missions_completed', (SELECT count(*) FROM daily_missions WHERE rewarded_at IS NOT NULL),
    'notes', (SELECT count(*) FROM notes),
    'learners', (SELECT count(*) FROM profiles),
    'learners_new_30d', (SELECT count(*) FROM profiles WHERE created_at > now() - interval '30 days'),
    'active_7d', (SELECT count(*) FROM profiles WHERE last_active > now() - interval '7 days'),
    'active_30d', (SELECT count(*) FROM profiles WHERE last_active > now() - interval '30 days'),
    'watchers', (SELECT count(DISTINCT user_id) FROM module_progress WHERE watch_time_seconds > 0),
    -- current_streak isn't reset until the learner returns, so only count
    -- streaks still alive (attended today or yesterday).
    'on_streak', (SELECT count(*) FROM user_progress WHERE current_streak > 0 AND last_attendance_date >= _today - 1),
    'longest_streak', (SELECT COALESCE(max(longest_streak), 0) FROM user_progress),
    'xp', (SELECT COALESCE(sum(total_xp), 0) FROM user_progress),
    'gems', (SELECT COALESCE(sum(total_gems), 0) FROM user_progress),
    -- Watch minutes for each of the last 30 days, oldest first, including empty days.
    'daily_watch', (
      SELECT jsonb_agg(jsonb_build_object('date', g.d::date, 'seconds', COALESCE(w.seconds, 0)) ORDER BY g.d)
      FROM generate_series(_today::timestamp - interval '29 days', _today::timestamp, interval '1 day') AS g(d)
      LEFT JOIN (SELECT date, sum(seconds) AS seconds FROM watch_daily GROUP BY date) w ON w.date = g.d::date
    ),
    -- New learners per week (weeks start Monday) for the last 12 weeks.
    'weekly_signups', (
      SELECT jsonb_agg(jsonb_build_object('week', g.wk::date, 'count', COALESCE(s.n, 0)) ORDER BY g.wk)
      FROM generate_series(
        date_trunc('week', _today::timestamp) - interval '11 weeks',
        date_trunc('week', _today::timestamp),
        interval '1 week'
      ) AS g(wk)
      LEFT JOIN (
        SELECT date_trunc('week', created_at AT TIME ZONE 'Asia/Dhaka') AS week_start, count(*) AS n
        FROM profiles GROUP BY 1
      ) s ON s.week_start = g.wk
    ),
    -- Courses with the most watch time. Every learner imports their own copy of
    -- a playlist, so copies of the same playlist count as one course.
    'top_courses', (
      SELECT COALESCE(jsonb_agg(t ORDER BY t.watch_seconds DESC), '[]'::jsonb) FROM (
        SELECT COALESCE(c.source_playlist_id, c.id::text) AS id,
               (array_agg(c.title ORDER BY c.created_at))[1] AS title,
               (array_agg(c.thumbnail_url ORDER BY c.created_at))[1] AS thumbnail_url,
               count(DISTINCT c.id) AS copies,
               count(DISTINCT mp.user_id) AS learners,
               COALESCE(sum(mp.watch_time_seconds), 0) AS watch_seconds,
               count(*) FILTER (WHERE mp.completed) AS completions
        FROM courses c
        JOIN modules m ON m.course_id = c.id
        JOIN module_progress mp ON mp.module_id = m.id
        WHERE NOT c.is_system
        GROUP BY 1
        ORDER BY watch_seconds DESC
        LIMIT 8
      ) t
    )
  ) INTO _result;

  RETURN _result;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_impact_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_impact_stats() TO authenticated;
