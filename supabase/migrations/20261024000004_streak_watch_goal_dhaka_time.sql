BEGIN;

-- Streak, timezone and cleanup fixes.
--
-- 1. Days follow Bangladesh time (Asia/Dhaka) instead of UTC, so "today" rolls
--    over at midnight for learners, not at 6 AM. Every daily boundary (watch goal,
--    mission, growth stats, AI message limit) goes through public.app_today().
--    Rows already written under UTC dates are left as they are.
-- 2. The streak grows only when the learner hits the daily watch goal (20 genuine
--    minutes, see record_watch_progress), not when they merely open the app.
--    mark_attendance still records attendance, and resets a streak that was
--    broken (no goal met yesterday or today) so the UI doesn't show a stale one.
-- 3. get_today_mission and reset_my_progress wrote current_streak / total_xp etc.
--    to public.profiles, but those columns moved to public.user_progress
--    (20260608020000), so completing a mission or resetting progress failed.
-- 4. Quizzes were removed: drop the unreachable quiz_master badge check.

CREATE OR REPLACE FUNCTION public.app_today()
RETURNS date
LANGUAGE sql STABLE
AS $$ SELECT (now() AT TIME ZONE 'Asia/Dhaka')::date $$;

CREATE OR REPLACE FUNCTION public.daily_watch_goal_seconds()
RETURNS int
LANGUAGE sql IMMUTABLE
AS $$ SELECT 20 * 60 $$;

ALTER TABLE public.ai_usage       ALTER COLUMN day  SET DEFAULT public.app_today();
ALTER TABLE public.daily_missions ALTER COLUMN date SET DEFAULT public.app_today();

-- Counts today toward the streak (once per day). Called when the watch goal is met.
CREATE OR REPLACE FUNCTION public.bump_streak(_uid uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today   date := public.app_today();
  _last    date;
  _streak  int;
  _longest int;
  _new     int;
BEGIN
  SELECT last_attendance_date, current_streak, longest_streak
    INTO _last, _streak, _longest
    FROM public.user_progress WHERE user_id = _uid
    FOR UPDATE;

  IF _last = _today THEN RETURN COALESCE(_streak, 0); END IF;
  _new := CASE WHEN _last = _today - 1 THEN COALESCE(_streak, 0) + 1 ELSE 1 END;

  INSERT INTO public.user_progress (user_id, current_streak, longest_streak, last_attendance_date)
  VALUES (_uid, _new, _new, _today)
  ON CONFLICT (user_id) DO UPDATE SET
    current_streak       = EXCLUDED.current_streak,
    longest_streak       = GREATEST(public.user_progress.longest_streak, EXCLUDED.current_streak),
    last_attendance_date = EXCLUDED.last_attendance_date;

  RETURN _new;
END $$;

REVOKE EXECUTE ON FUNCTION public.bump_streak(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_attendance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid    uuid := auth.uid();
  _today  date := public.app_today();
  _last   date;
  _streak int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.attendance (user_id, date) VALUES (_uid, _today) ON CONFLICT DO NOTHING;

  SELECT last_attendance_date, current_streak INTO _last, _streak
    FROM public.user_progress WHERE user_id = _uid;

  -- Goal missed on a full day since the last streak day: the streak is over.
  IF _last IS NOT NULL AND _last < _today - 1 AND COALESCE(_streak, 0) <> 0 THEN
    UPDATE public.user_progress SET current_streak = 0 WHERE user_id = _uid;
    _streak := 0;
  END IF;

  UPDATE public.profiles SET last_active = now() WHERE id = _uid;
  RETURN jsonb_build_object('streak', COALESCE(_streak, 0));
END $$;

CREATE OR REPLACE FUNCTION public.record_watch_progress(_module_id uuid, _watched_seconds numeric, _segments jsonb, _video_duration integer DEFAULT NULL::integer)
 RETURNS module_progress
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid             uuid := auth.uid();
  _duration        int;
  _existing        public.module_progress%ROWTYPE;
  _found           boolean;
  _elapsed         numeric;
  _delta           int;
  _new_ranges      int4multirange;
  _old_covered     int;
  _new_covered     int;
  _pct             numeric(5,2);
  _completed       boolean;
  _newly_completed boolean := false;
  _result          public.module_progress%ROWTYPE;
  _today_seconds   int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_module_unlocked(_uid, _module_id) THEN RAISE EXCEPTION 'Module is locked'; END IF;

  SELECT duration_seconds INTO _duration FROM public.modules WHERE id = _module_id;
  IF COALESCE(_duration, 0) <= 0 THEN _duration := COALESCE(_video_duration, 0); END IF;
  IF _duration <= 0 THEN RAISE EXCEPTION 'Unknown video duration'; END IF;

  SELECT * INTO _existing
  FROM public.module_progress
  WHERE user_id = _uid AND module_id = _module_id
  FOR UPDATE;
  _found := FOUND;

  -- Wall-clock time since the previous report (first report: allow one interval).
  _elapsed := CASE
    WHEN _found AND _existing.last_watch_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (now() - _existing.last_watch_at))
    ELSE 30
  END;

  -- Real watch time can't exceed the real time that passed. No additive slack:
  -- a per-call allowance would let a script inflate totals by calling in a loop.
  _delta := GREATEST(0, LEAST(COALESCE(_watched_seconds, 0), _elapsed))::int;

  IF _delta > 0 THEN
    INSERT INTO public.watch_daily (user_id, date, seconds)
    VALUES (_uid, public.app_today(), _delta)
    ON CONFLICT (user_id, date) DO UPDATE SET
      seconds    = public.watch_daily.seconds + EXCLUDED.seconds,
      updated_at = now()
    RETURNING seconds INTO _today_seconds;

    IF _today_seconds >= public.daily_watch_goal_seconds() THEN
      PERFORM public.bump_streak(_uid);
    END IF;
  END IF;

  -- Merge the newly played segments (clamped to the video length).
  SELECT COALESCE(range_agg(int4range(s, e)), '{}'::int4multirange)
  INTO _new_ranges
  FROM (
    SELECT GREATEST(0, FLOOR((seg ->> 0)::numeric))::int           AS s,
           LEAST(_duration, CEIL((seg ->> 1)::numeric))::int        AS e
    FROM jsonb_array_elements(COALESCE(_segments, '[]'::jsonb)) AS seg
    WHERE jsonb_typeof(seg) = 'array' AND jsonb_array_length(seg) = 2
  ) x
  WHERE e > s;

  _new_ranges := COALESCE(_existing.watched_ranges, '{}'::int4multirange) + _new_ranges;

  SELECT COALESCE(SUM(upper(r) - lower(r)), 0) INTO _old_covered
  FROM unnest(COALESCE(_existing.watched_ranges, '{}'::int4multirange)) r;
  SELECT COALESCE(SUM(upper(r) - lower(r)), 0) INTO _new_covered
  FROM unnest(_new_ranges) r;

  -- New coverage can't exceed what could be played in the elapsed time at YouTube's
  -- max 2x speed (2.5x leaves room for timing jitter between reports).
  IF _new_covered - _old_covered > _elapsed * 2.5 THEN
    _new_ranges  := COALESCE(_existing.watched_ranges, '{}'::int4multirange);
    _new_covered := _old_covered;
  END IF;

  _pct := LEAST(100, ROUND(_new_covered::numeric / _duration * 100, 2));
  _completed := _pct >= 90 OR (_found AND _existing.completed);

  IF _completed AND NOT (_found AND _existing.completed) THEN
    _newly_completed := true;
  END IF;

  INSERT INTO public.module_progress (
    user_id, module_id, watch_time_seconds, percent_watched, watched_ranges,
    completed, completed_at, video_finished, last_watch_at, updated_at
  )
  VALUES (
    _uid, _module_id, _delta, _pct, _new_ranges,
    _completed, CASE WHEN _completed THEN now() END, _completed, now(), now()
  )
  ON CONFLICT (user_id, module_id) DO UPDATE SET
    watch_time_seconds = public.module_progress.watch_time_seconds + _delta,
    percent_watched    = EXCLUDED.percent_watched,
    watched_ranges     = EXCLUDED.watched_ranges,
    completed          = EXCLUDED.completed,
    completed_at       = COALESCE(public.module_progress.completed_at, EXCLUDED.completed_at),
    video_finished     = EXCLUDED.video_finished OR public.module_progress.video_finished,
    last_watch_at      = now(),
    updated_at         = now()
  RETURNING * INTO _result;

  UPDATE public.profiles SET last_active = now() WHERE id = _uid;

  IF _newly_completed THEN
    PERFORM public.award_progress(_uid, 2, 50);
  END IF;

  RETURN _result;
END $function$;

GRANT EXECUTE ON FUNCTION public.record_watch_progress(uuid, numeric, jsonb, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_today_mission()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _today date := public.app_today();
  _yest date := _today - 1;
  _m public.daily_missions%ROWTYPE;
  _tasks jsonb := '[]'::jsonb;
  _mod record;
  _t jsonb;
  _is_done boolean;
  _mid uuid;
  _done int := 0;
  _total int := 0;
  _all_done boolean;
  _watched_min int;
  _goal_min constant int := public.daily_watch_goal_seconds() / 60;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _m FROM public.daily_missions WHERE user_id=_uid AND date=_today FOR UPDATE;

  IF NOT FOUND THEN
    FOR _mod IN
      SELECT m.id, m.title, m.position, c.id AS course_id
      FROM public.courses c
      JOIN public.modules m ON m.course_id = c.id
      LEFT JOIN public.module_progress mp ON mp.module_id = m.id AND mp.user_id = _uid
      WHERE c.user_id = _uid
        AND COALESCE(mp.completed,false) = false
        AND public.is_module_unlocked(_uid, m.id)
      ORDER BY c.updated_at DESC, m.position ASC
      LIMIT 3
    LOOP
      _tasks := _tasks || jsonb_build_array(jsonb_build_object(
        'kind','lesson',
        'module_id', _mod.id,
        'course_id', _mod.course_id,
        'title', 'Watch: ' || _mod.title,
        'done', false
      ));
    END LOOP;
    _tasks := _tasks || jsonb_build_array(jsonb_build_object(
      'kind','watch',
      'title','Watch ' || _goal_min || ' minutes today',
      'goal_minutes', _goal_min,
      'done', false
    ));
    INSERT INTO public.daily_missions(user_id, date, tasks, total_tasks, done_tasks)
      VALUES (_uid, _today, _tasks, jsonb_array_length(_tasks), 0)
      RETURNING * INTO _m;
  END IF;

  -- recompute done state
  _tasks := '[]'::jsonb;
  FOR _t IN SELECT value FROM jsonb_array_elements(_m.tasks) LOOP
    -- Missions created before quizzes were removed: swap the quiz task for the watch goal.
    IF _t->>'kind' = 'quiz' THEN
      _t := jsonb_build_object('kind','watch','title','Watch ' || _goal_min || ' minutes today',
                               'goal_minutes', _goal_min, 'done', false);
    END IF;
    _is_done := false;
    IF _t->>'kind' = 'lesson' THEN
      _mid := (_t->>'module_id')::uuid;
      SELECT COALESCE(completed,false) INTO _is_done
        FROM public.module_progress WHERE user_id=_uid AND module_id=_mid;
    ELSIF _t->>'kind' = 'watch' THEN
      SELECT seconds / 60 INTO _watched_min
        FROM public.watch_daily WHERE user_id=_uid AND date=_today;
      _watched_min := COALESCE(_watched_min, 0);
      _is_done := _watched_min >= COALESCE((_t->>'goal_minutes')::int, _goal_min);
      _t := jsonb_set(_t, '{progress_minutes}', to_jsonb(_watched_min));
    END IF;
    _t := jsonb_set(_t, '{done}', to_jsonb(COALESCE(_is_done,false)));
    _tasks := _tasks || jsonb_build_array(_t);
    _total := _total + 1;
    IF COALESCE(_is_done,false) THEN _done := _done + 1; END IF;
  END LOOP;

  _all_done := (_total > 0 AND _done = _total);

  UPDATE public.daily_missions
    SET tasks = _tasks,
        total_tasks = _total,
        done_tasks = _done,
        completed_at = CASE WHEN _all_done AND completed_at IS NULL THEN now() ELSE completed_at END,
        updated_at = now()
    WHERE user_id=_uid AND date=_today
    RETURNING * INTO _m;

  IF _all_done AND _m.rewarded_at IS NULL THEN
    -- The streak is bumped by record_watch_progress when the watch goal is hit.
    PERFORM public.award_progress(_uid, 10, 50);

    UPDATE public.daily_missions SET rewarded_at = now()
      WHERE user_id=_uid AND date=_today RETURNING * INTO _m;

    PERFORM public.dispatch_notification(
      _uid, 'system_success', 'Mission complete! 🎯',
      'You hit today''s goal — +50 XP, +10 Gems. See you tomorrow!',
      'high', '/growth', jsonb_build_object('date', _today),
      'mission:'|| _today::text, 24);
  END IF;

  RETURN jsonb_build_object(
    'date', _m.date,
    'tasks', _m.tasks,
    'total', _m.total_tasks,
    'done', _m.done_tasks,
    'completed_at', _m.completed_at,
    'rewarded_at', _m.rewarded_at
  );
END $function$;

CREATE OR REPLACE FUNCTION public.get_growth_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _today date := public.app_today();
  _yest date := _today - 1;
  _t_lessons int; _t_minutes int;
  _y_lessons int; _y_minutes int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT COUNT(*)::int INTO _t_lessons FROM public.module_progress
    WHERE user_id=_uid AND completed=true AND (completed_at AT TIME ZONE 'Asia/Dhaka')::date = _today;
  SELECT COUNT(*)::int INTO _y_lessons FROM public.module_progress
    WHERE user_id=_uid AND completed=true AND (completed_at AT TIME ZONE 'Asia/Dhaka')::date = _yest;
  -- Genuine minutes watched that day (seeks and skips never count).
  SELECT COALESCE(SUM(seconds),0)/60 INTO _t_minutes FROM public.watch_daily
    WHERE user_id=_uid AND date = _today;
  SELECT COALESCE(SUM(seconds),0)/60 INTO _y_minutes FROM public.watch_daily
    WHERE user_id=_uid AND date = _yest;
  RETURN jsonb_build_object(
    'today', jsonb_build_object('lessons',_t_lessons,'minutes',_t_minutes),
    'yesterday', jsonb_build_object('lessons',_y_lessons,'minutes',_y_minutes)
  );
END $function$;

CREATE OR REPLACE FUNCTION public.consume_ai_message(_daily_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _today date := public.app_today();
  _is_paid boolean;
  _count int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  SELECT is_paid_user INTO _is_paid FROM public.user_entitlements WHERE user_id = _uid;

  INSERT INTO public.ai_usage(user_id, day, count) VALUES (_uid, _today, 0)
    ON CONFLICT (user_id, day) DO NOTHING;

  -- lock row
  SELECT count INTO _count FROM public.ai_usage
    WHERE user_id = _uid AND day = _today FOR UPDATE;

  IF NOT COALESCE(_is_paid, false) AND _count >= _daily_limit THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'limit_reached',
      'count', _count,
      'limit', _daily_limit,
      'remaining', 0,
      'paid', false
    );
  END IF;

  UPDATE public.ai_usage SET count = count + 1
    WHERE user_id = _uid AND day = _today
    RETURNING count INTO _count;

  RETURN jsonb_build_object(
    'ok', true,
    'count', _count,
    'limit', _daily_limit,
    'remaining', CASE WHEN COALESCE(_is_paid, false) THEN NULL ELSE GREATEST(0, _daily_limit - _count) END,
    'paid', COALESCE(_is_paid, false)
  );
END $function$;

CREATE OR REPLACE FUNCTION public.get_ai_usage_today(_daily_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _today date := public.app_today();
  _is_paid boolean;
  _count int;
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  SELECT is_paid_user INTO _is_paid FROM public.user_entitlements WHERE user_id = _uid;
  SELECT count INTO _count FROM public.ai_usage WHERE user_id = _uid AND day = _today;
  _count := COALESCE(_count, 0);
  RETURN jsonb_build_object(
    'count', _count,
    'limit', _daily_limit,
    'remaining', CASE WHEN COALESCE(_is_paid, false) THEN NULL ELSE GREATEST(0, _daily_limit - _count) END,
    'paid', COALESCE(_is_paid, false)
  );
END $function$;

CREATE OR REPLACE FUNCTION public.check_achievements()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid               UUID := auth.uid();
  _streak            INT;
  _gems              INT;
  _completed_modules INT;
  _completed_courses INT;
  _new               TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT current_streak, total_gems INTO _streak, _gems
    FROM public.user_progress WHERE user_id = _uid;
  SELECT COUNT(*) INTO _completed_modules
    FROM public.module_progress WHERE user_id = _uid AND completed = true;
  SELECT COUNT(DISTINCT c.id) INTO _completed_courses
    FROM public.courses c
    WHERE EXISTS (SELECT 1 FROM public.modules m WHERE m.course_id = c.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.modules m
        LEFT JOIN public.module_progress mp ON mp.module_id = m.id AND mp.user_id = _uid
        WHERE m.course_id = c.id AND COALESCE(mp.completed, false) = false
      );

  IF _streak >= 7  AND public.award_achievement(_uid, 'streak_7',    50, 3)  THEN _new := array_append(_new, 'streak_7');    END IF;
  IF _streak >= 30 AND public.award_achievement(_uid, 'streak_30',  200, 10) THEN _new := array_append(_new, 'streak_30');   END IF;
  IF _completed_modules >= 1  AND public.award_achievement(_uid, 'first_module', 25,  1)  THEN _new := array_append(_new, 'first_module'); END IF;
  IF _completed_modules >= 10 AND public.award_achievement(_uid, 'modules_10',  75,  3)  THEN _new := array_append(_new, 'modules_10');  END IF;
  IF _completed_modules >= 50 AND public.award_achievement(_uid, 'modules_50',  250, 10) THEN _new := array_append(_new, 'modules_50');  END IF;
  IF _completed_courses >= 1  AND public.award_achievement(_uid, 'first_course', 100, 5) THEN _new := array_append(_new, 'first_course'); END IF;
  IF _gems >= 100             AND public.award_achievement(_uid, 'gems_100',     50,  0) THEN _new := array_append(_new, 'gems_100');     END IF;

  RETURN jsonb_build_object('new', _new);
END $function$;

CREATE OR REPLACE FUNCTION public.reset_my_progress()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.module_progress WHERE user_id = _uid;
  DELETE FROM public.mcq_attempts    WHERE user_id = _uid;
  DELETE FROM public.attendance      WHERE user_id = _uid;
  DELETE FROM public.certificates    WHERE user_id = _uid;
  DELETE FROM public.watch_daily     WHERE user_id = _uid;
  UPDATE public.user_progress
    SET total_gems = 0, total_xp = 0, current_streak = 0, longest_streak = 0,
        last_attendance_date = NULL
    WHERE user_id = _uid;
END $$;

COMMIT;
