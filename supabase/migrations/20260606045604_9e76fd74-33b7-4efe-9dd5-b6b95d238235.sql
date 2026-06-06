-- 1) daily_missions table
CREATE TABLE public.daily_missions (
  user_id uuid NOT NULL,
  date date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  tasks jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_tasks int NOT NULL DEFAULT 0,
  done_tasks int NOT NULL DEFAULT 0,
  completed_at timestamptz,
  rewarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

GRANT SELECT ON public.daily_missions TO authenticated;
GRANT ALL ON public.daily_missions TO service_role;

ALTER TABLE public.daily_missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY missions_select_own ON public.daily_missions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY missions_block_writes ON public.daily_missions
  AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);

-- 2) get_today_mission RPC
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
      'kind','quiz',
      'title','Complete today''s daily challenge',
      'done', false
    ));
    INSERT INTO public.daily_missions(user_id, date, tasks, total_tasks, done_tasks)
      VALUES (_uid, _today, _tasks, jsonb_array_length(_tasks), 0)
      RETURNING * INTO _m;
  END IF;

  -- recompute done state
  _tasks := '[]'::jsonb;
  FOR _t IN SELECT value FROM jsonb_array_elements(_m.tasks) LOOP
    _is_done := false;
    IF _t->>'kind' = 'lesson' THEN
      _mid := (_t->>'module_id')::uuid;
      SELECT COALESCE(completed,false) INTO _is_done
        FROM public.module_progress WHERE user_id=_uid AND module_id=_mid;
    ELSIF _t->>'kind' = 'quiz' THEN
      SELECT EXISTS(
        SELECT 1 FROM public.daily_challenges
        WHERE user_id=_uid AND date=_today AND passed=true
      ) INTO _is_done;
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

-- 3) get_growth_stats RPC
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
  _t_lessons int; _t_quizzes int; _t_minutes int;
  _y_lessons int; _y_quizzes int; _y_minutes int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT COUNT(*)::int INTO _t_lessons FROM public.module_progress
    WHERE user_id=_uid AND completed=true AND completed_at::date = _today;
  SELECT COUNT(*)::int INTO _y_lessons FROM public.module_progress
    WHERE user_id=_uid AND completed=true AND completed_at::date = _yest;
  SELECT COUNT(*)::int INTO _t_quizzes FROM public.mcq_attempts
    WHERE user_id=_uid AND created_at::date = _today;
  SELECT COUNT(*)::int INTO _y_quizzes FROM public.mcq_attempts
    WHERE user_id=_uid AND created_at::date = _yest;
  SELECT (COALESCE(SUM(watch_time_seconds),0)/60)::int INTO _t_minutes FROM public.module_progress
    WHERE user_id=_uid AND updated_at::date = _today;
  SELECT (COALESCE(SUM(watch_time_seconds),0)/60)::int INTO _y_minutes FROM public.module_progress
    WHERE user_id=_uid AND updated_at::date = _yest;
  RETURN jsonb_build_object(
    'today', jsonb_build_object('lessons',_t_lessons,'quizzes',_t_quizzes,'minutes',_t_minutes),
    'yesterday', jsonb_build_object('lessons',_y_lessons,'quizzes',_y_quizzes,'minutes',_y_minutes)
  );
END $$;

REVOKE ALL ON FUNCTION public.get_growth_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_growth_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_growth_stats() TO authenticated;

-- 4) Streak rework: stop bumping streak on lesson completion
CREATE OR REPLACE FUNCTION public.update_module_progress(_module_id uuid, _watch_time integer, _force_complete boolean DEFAULT false)
RETURNS module_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid UUID := auth.uid(); _duration INT; _pct NUMERIC(5,2); _completed BOOLEAN;
        _existing public.module_progress%ROWTYPE; _result public.module_progress%ROWTYPE; _newly_completed BOOLEAN := false;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_module_unlocked(_uid, _module_id) THEN RAISE EXCEPTION 'Module is locked'; END IF;
  SELECT duration_seconds INTO _duration FROM public.modules WHERE id = _module_id;
  IF _duration IS NULL OR _duration = 0 THEN _duration := 1; END IF;
  IF _watch_time < 0 THEN _watch_time := 0; END IF;
  IF _watch_time > _duration THEN _watch_time := _duration; END IF;
  SELECT * INTO _existing FROM public.module_progress WHERE user_id = _uid AND module_id = _module_id;
  IF FOUND AND _existing.watch_time_seconds > _watch_time THEN _watch_time := _existing.watch_time_seconds; END IF;
  _pct := LEAST(100, ROUND((_watch_time::NUMERIC / _duration) * 100, 2));
  _completed := _force_complete OR _pct >= 90 OR (FOUND AND _existing.completed);
  IF _completed AND (NOT FOUND OR NOT _existing.completed) THEN _newly_completed := true; END IF;

  INSERT INTO public.module_progress (user_id, module_id, watch_time_seconds, percent_watched, completed, completed_at, updated_at)
  VALUES (_uid, _module_id, _watch_time, _pct, _completed, CASE WHEN _completed THEN now() ELSE NULL END, now())
  ON CONFLICT (user_id, module_id) DO UPDATE SET
    watch_time_seconds = EXCLUDED.watch_time_seconds,
    percent_watched = EXCLUDED.percent_watched,
    completed = EXCLUDED.completed,
    completed_at = COALESCE(public.module_progress.completed_at, EXCLUDED.completed_at),
    updated_at = now()
  RETURNING * INTO _result;

  UPDATE public.profiles SET last_active = now() WHERE id = _uid;

  IF _newly_completed THEN
    PERFORM public.award_progress(_uid, 2, 50);
    -- Streak is now driven by daily mission completion in get_today_mission()
  END IF;

  RETURN _result;
END; $function$;