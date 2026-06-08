BEGIN;

-- ===========================================================
-- Drop the orphaned milestone trigger (was named without the
-- trg_ prefix — previous DROP missed it).
-- ===========================================================
DROP TRIGGER IF EXISTS profile_milestone_notify ON public.profiles;
DROP TRIGGER IF EXISTS trg_profile_milestone_notify ON public.profiles;
DROP FUNCTION IF EXISTS public.profile_milestone_notify();

-- ===========================================================
-- award_progress: write to user_progress instead of profiles
-- ===========================================================
CREATE OR REPLACE FUNCTION public.award_progress(_user_id UUID, _gems INT, _xp INT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.user_progress
  SET total_gems = total_gems + _gems,
      total_xp   = total_xp   + _xp
  WHERE user_id = _user_id;
$$;

-- ===========================================================
-- mark_attendance: read/write streaks from user_progress
-- ===========================================================
CREATE OR REPLACE FUNCTION public.mark_attendance()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid     UUID := auth.uid();
  _today   DATE := (now() AT TIME ZONE 'UTC')::date;
  _last    DATE;
  _streak  INT;
  _longest INT;
  _new_streak INT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.attendance (user_id, date) VALUES (_uid, _today) ON CONFLICT DO NOTHING;
  SELECT last_attendance_date, current_streak, longest_streak
    INTO _last, _streak, _longest
    FROM public.user_progress WHERE user_id = _uid;
  IF _last = _today THEN
    RETURN jsonb_build_object('streak', _streak, 'already', true);
  ELSIF _last = _today - INTERVAL '1 day' THEN
    _new_streak := _streak + 1;
  ELSE
    _new_streak := 1;
  END IF;
  UPDATE public.user_progress
  SET current_streak       = _new_streak,
      longest_streak       = GREATEST(_longest, _new_streak),
      last_attendance_date = _today
  WHERE user_id = _uid;
  UPDATE public.profiles SET last_active = now() WHERE id = _uid;
  RETURN jsonb_build_object('streak', _new_streak, 'already', false);
END; $$;

-- ===========================================================
-- check_achievements: read streak/gems from user_progress
-- ===========================================================
CREATE OR REPLACE FUNCTION public.check_achievements()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid               UUID := auth.uid();
  _streak            INT;
  _gems              INT;
  _completed_modules INT;
  _completed_courses INT;
  _passed_quizzes    INT;
  _new               TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT current_streak, total_gems INTO _streak, _gems
    FROM public.user_progress WHERE user_id = _uid;
  SELECT COUNT(*) INTO _completed_modules
    FROM public.module_progress WHERE user_id = _uid AND completed = true;
  SELECT COUNT(*) INTO _passed_quizzes
    FROM public.module_progress WHERE user_id = _uid AND mcq_passed = true;
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
  IF _passed_quizzes >= 5     AND public.award_achievement(_uid, 'quiz_master',  75,  3) THEN _new := array_append(_new, 'quiz_master');  END IF;
  IF _gems >= 100             AND public.award_achievement(_uid, 'gems_100',     50,  0) THEN _new := array_append(_new, 'gems_100');     END IF;

  RETURN jsonb_build_object('new', _new);
END $$;

COMMIT;
