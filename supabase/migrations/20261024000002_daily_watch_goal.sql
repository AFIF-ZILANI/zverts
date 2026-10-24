BEGIN;

-- Quizzes are removed from the app. The daily mission required "Complete today's
-- daily challenge" (a quiz), which could no longer be done, so nobody could finish a
-- mission or grow a streak.
--
-- New daily goal: watch 20 genuine minutes today (from watch_daily, filled by
-- record_watch_progress — skipped/seeked parts never count). Every mission has this
-- task, so a mission is never empty even when all lessons are finished.
--
-- get_today_mission is otherwise unchanged. get_growth_stats drops the quiz count and
-- reports real minutes watched per day. Quiz tables and past data are left in place.

CREATE OR REPLACE FUNCTION public.get_today_mission()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'UTC')::date;
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
  _last_streak_date date;
  _streak int;
  _longest int;
  _new_streak int;
  _watched_min int;
  _goal_min constant int := 20;  -- daily genuine watch-time goal
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
    PERFORM public.award_progress(_uid, 10, 50);

    SELECT last_attendance_date, current_streak, longest_streak
      INTO _last_streak_date, _streak, _longest
      FROM public.profiles WHERE id=_uid;

    IF _last_streak_date = _today THEN
      _new_streak := COALESCE(_streak,0);
    ELSIF _last_streak_date = _yest THEN
      _new_streak := COALESCE(_streak,0) + 1;
    ELSE
      _new_streak := 1;
    END IF;

    UPDATE public.profiles
      SET current_streak = _new_streak,
          longest_streak = GREATEST(COALESCE(_longest,0), _new_streak),
          last_attendance_date = _today
      WHERE id=_uid;

    INSERT INTO public.attendance(user_id, date) VALUES (_uid, _today) ON CONFLICT DO NOTHING;

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
END $$;

REVOKE ALL ON FUNCTION public.get_today_mission() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_today_mission() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_today_mission() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_growth_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'UTC')::date;
  _yest date := _today - 1;
  _t_lessons int; _t_minutes int;
  _y_lessons int; _y_minutes int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT COUNT(*)::int INTO _t_lessons FROM public.module_progress
    WHERE user_id=_uid AND completed=true AND completed_at::date = _today;
  SELECT COUNT(*)::int INTO _y_lessons FROM public.module_progress
    WHERE user_id=_uid AND completed=true AND completed_at::date = _yest;
  -- Genuine minutes watched that day (seeks and skips never count).
  SELECT COALESCE(SUM(seconds),0)/60 INTO _t_minutes FROM public.watch_daily
    WHERE user_id=_uid AND date = _today;
  SELECT COALESCE(SUM(seconds),0)/60 INTO _y_minutes FROM public.watch_daily
    WHERE user_id=_uid AND date = _yest;
  RETURN jsonb_build_object(
    'today', jsonb_build_object('lessons',_t_lessons,'minutes',_t_minutes),
    'yesterday', jsonb_build_object('lessons',_y_lessons,'minutes',_y_minutes)
  );
END $$;

REVOKE ALL ON FUNCTION public.get_growth_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_growth_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_growth_stats() TO authenticated;

COMMIT;
