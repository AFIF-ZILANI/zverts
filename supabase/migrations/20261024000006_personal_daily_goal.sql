BEGIN;

-- The daily watch goal follows each learner's "Daily learning goal" setting
-- (user_preferences.daily_goal_minutes) instead of a fixed 20 minutes. It drives
-- both the daily mission's watch task and the streak (record_watch_progress).
--
-- Default goal is 20 minutes, the value the mission and streak have used so far.
-- The old column default was 30 but nothing read it; 53 of 55 learners still had
-- that untouched 30, so reset 30 -> 20 to keep everyone's current goal unchanged.
-- Learners who picked another value keep it.

ALTER TABLE public.user_preferences ALTER COLUMN daily_goal_minutes SET DEFAULT 20;
UPDATE public.user_preferences SET daily_goal_minutes = 20 WHERE daily_goal_minutes = 30;

CREATE OR REPLACE FUNCTION public.daily_watch_goal_seconds(_uid uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Same 5–480 minute range the Settings page allows.
  SELECT LEAST(480, GREATEST(5, COALESCE(
    (SELECT daily_goal_minutes FROM public.user_preferences WHERE user_id = _uid), 20
  ))) * 60
$$;

REVOKE EXECUTE ON FUNCTION public.daily_watch_goal_seconds(uuid) FROM PUBLIC, anon, authenticated;

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

    IF _today_seconds >= public.daily_watch_goal_seconds(_uid) THEN
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
  _goal_min constant int := public.daily_watch_goal_seconds(_uid) / 60;
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
      -- Always the learner's current goal, so a change in Settings applies today.
      _t := _t || jsonb_build_object('title', 'Watch ' || _goal_min || ' minutes today',
                                     'goal_minutes', _goal_min);
      SELECT seconds / 60 INTO _watched_min
        FROM public.watch_daily WHERE user_id=_uid AND date=_today;
      _watched_min := COALESCE(_watched_min, 0);
      _is_done := _watched_min >= _goal_min;
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

DROP FUNCTION IF EXISTS public.daily_watch_goal_seconds();

COMMIT;
