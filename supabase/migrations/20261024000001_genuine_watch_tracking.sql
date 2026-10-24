BEGIN;

-- Genuine watch tracking.
--
-- Before: the client sent the player's current position as "watch time" and the
-- server kept the max, so seeking to the end counted as watching the whole video;
-- the ended event also force-completed the lesson.
--
-- Now:
--   * watched_ranges     — the video seconds the user actually played (seeks skip
--                          ahead without adding ranges). percent_watched = covered
--                          seconds / duration; the next lesson unlocks at 90%.
--   * watch_time_seconds — real seconds spent watching (what the dashboard sums).
--   * last_watch_at      — server timestamp of the last report; every report is
--                          capped by the wall-clock time since the previous one,
--                          so calling the RPC directly can't inflate either value.
--   * watch_daily        — real seconds watched per user per (UTC) day, for the
--                          daily watch goal, growth stats and the weekly chart.
--   * The module quiz no longer gates the next lesson.

ALTER TABLE public.module_progress
  ADD COLUMN IF NOT EXISTS watched_ranges int4multirange NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_watch_at  timestamptz;

CREATE TABLE IF NOT EXISTS public.watch_daily (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       date NOT NULL,
  seconds    int  NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);
ALTER TABLE public.watch_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS watch_daily_select_own ON public.watch_daily;
CREATE POLICY watch_daily_select_own ON public.watch_daily
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- Writes happen only inside record_watch_progress (SECURITY DEFINER).

-- Carry over in-progress rows as "watched from the start up to their old percent"
-- so learners mid-video don't drop to 0%.
UPDATE public.module_progress mp
SET watched_ranges = int4multirange(
      int4range(0, GREATEST(1, FLOOR(mp.percent_watched / 100.0 * m.duration_seconds)::int))
    )
FROM public.modules m
WHERE m.id = mp.module_id
  AND mp.percent_watched > 0
  AND m.duration_seconds > 0
  AND mp.watched_ranges = '{}';

-- ─────────────────────────────────────────────────────────────────────────────
-- record_watch_progress
--   _watched_seconds : real seconds spent playing since the last report
--   _segments        : [[start, end], ...] video seconds played since the last report
--   _video_duration  : player-reported duration, used only if modules has none
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_watch_progress(
  _module_id       uuid,
  _watched_seconds numeric,
  _segments        jsonb,
  _video_duration  integer DEFAULT NULL
)
RETURNS public.module_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    VALUES (_uid, (now() AT TIME ZONE 'UTC')::date, _delta)
    ON CONFLICT (user_id, date) DO UPDATE SET
      seconds    = public.watch_daily.seconds + EXCLUDED.seconds,
      updated_at = now();
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
END $$;

GRANT EXECUTE ON FUNCTION public.record_watch_progress(uuid, numeric, jsonb, integer) TO authenticated;

-- The old RPC trusted the client's position and accepted _force_complete,
-- which let anyone complete a lesson without watching it.
DROP FUNCTION IF EXISTS public.update_module_progress(uuid, integer, boolean);

-- ─────────────────────────────────────────────────────────────────────────────
-- is_module_unlocked – previous lesson watched to 90% (quiz no longer required)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_module_unlocked(_user_id UUID, _module_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pos           INT;
  _course        UUID;
  _prev_unlocked BOOLEAN;
BEGIN
  SELECT position, course_id INTO _pos, _course
  FROM public.modules WHERE id = _module_id;

  IF _pos IS NULL THEN RETURN false; END IF;
  IF _pos = 1     THEN RETURN true;  END IF;

  SELECT COALESCE(mp.completed, false) INTO _prev_unlocked
  FROM public.modules m
  LEFT JOIN public.module_progress mp
    ON mp.module_id = m.id AND mp.user_id = _user_id
  WHERE m.course_id = _course AND m.position = _pos - 1;

  RETURN COALESCE(_prev_unlocked, false);
END;
$$;

COMMIT;
