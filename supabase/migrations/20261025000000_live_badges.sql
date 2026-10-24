-- Live badges.
--
-- Before: badges were only checked when the dashboard's Badges card mounted,
-- streak badges looked at the current streak only (a 7-day run that broke
-- before the next dashboard visit never counted), two checks at once could
-- hit the (user_id, code) unique key and fail, and "Course Conqueror" scanned
-- every course in the database.
--
-- Now: one internal checker runs from triggers the moment a module is
-- completed or a streak / gem total changes, and from check_achievements(),
-- which also returns the numbers behind each badge so the UI can show
-- progress. Achievements are on realtime so unlocks appear immediately.

BEGIN;

-- Idempotent: a concurrent award is a no-op instead of an error.
CREATE OR REPLACE FUNCTION public.award_achievement(_user_id UUID, _code TEXT, _xp INT DEFAULT 25, _gems INT DEFAULT 1)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.achievements (user_id, code) VALUES (_user_id, _code)
    ON CONFLICT (user_id, code) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM public.award_progress(_user_id, _gems, _xp);
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.award_achievement(uuid,text,int,int) FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.evaluate_achievements(_uid UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _streak            INT := 0;
  _gems              INT := 0;
  _completed_modules INT := 0;
  _completed_courses INT := 0;
  _new               TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT GREATEST(COALESCE(current_streak, 0), COALESCE(longest_streak, 0)), COALESCE(total_gems, 0)
    INTO _streak, _gems
    FROM public.user_progress WHERE user_id = _uid;
  _streak := COALESCE(_streak, 0);
  _gems   := COALESCE(_gems, 0);

  SELECT COUNT(*) INTO _completed_modules
    FROM public.module_progress WHERE user_id = _uid AND completed = true;

  -- Only courses the user has finished at least one module of can be complete.
  SELECT COUNT(*) INTO _completed_courses
    FROM (
      SELECT DISTINCT m.course_id
        FROM public.module_progress mp
        JOIN public.modules m ON m.id = mp.module_id
       WHERE mp.user_id = _uid AND mp.completed = true
    ) c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.modules m
       LEFT JOIN public.module_progress mp ON mp.module_id = m.id AND mp.user_id = _uid
      WHERE m.course_id = c.course_id AND COALESCE(mp.completed, false) = false
   );

  IF _completed_modules >= 1  AND public.award_achievement(_uid, 'first_module', 25,  1)  THEN _new := array_append(_new, 'first_module'); END IF;
  IF _completed_modules >= 10 AND public.award_achievement(_uid, 'modules_10',   75,  3)  THEN _new := array_append(_new, 'modules_10');   END IF;
  IF _completed_modules >= 50 AND public.award_achievement(_uid, 'modules_50',   250, 10) THEN _new := array_append(_new, 'modules_50');   END IF;
  IF _completed_courses >= 1  AND public.award_achievement(_uid, 'first_course', 100, 5)  THEN _new := array_append(_new, 'first_course'); END IF;
  IF _streak >= 7             AND public.award_achievement(_uid, 'streak_7',     50,  3)  THEN _new := array_append(_new, 'streak_7');     END IF;
  IF _streak >= 30            AND public.award_achievement(_uid, 'streak_30',    200, 10) THEN _new := array_append(_new, 'streak_30');    END IF;

  -- Badge rewards above can carry the gem total past 100.
  SELECT COALESCE(total_gems, 0) INTO _gems FROM public.user_progress WHERE user_id = _uid;
  _gems := COALESCE(_gems, 0);
  IF _gems >= 100             AND public.award_achievement(_uid, 'gems_100',     50,  0)  THEN _new := array_append(_new, 'gems_100');     END IF;

  RETURN jsonb_build_object(
    'new', _new,
    'stats', jsonb_build_object(
      'modules', _completed_modules,
      'courses', _completed_courses,
      'streak',  _streak,
      'gems',    _gems
    )
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.evaluate_achievements(uuid) FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.check_achievements()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN public.evaluate_achievements(auth.uid());
END $$;

-- Triggers. A badge check must never block saving progress, so failures
-- become warnings. Awards update user_progress themselves; the depth guard
-- stops that update from re-entering the checker.
CREATE OR REPLACE FUNCTION public.tg_check_achievements()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  BEGIN
    PERFORM public.evaluate_achievements(NEW.user_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'evaluate_achievements(%) failed: %', NEW.user_id, SQLERRM;
  END;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.tg_check_achievements() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS module_progress_check_achievements ON public.module_progress;
CREATE TRIGGER module_progress_check_achievements
  AFTER INSERT OR UPDATE OF completed ON public.module_progress
  FOR EACH ROW WHEN (NEW.completed)
  EXECUTE FUNCTION public.tg_check_achievements();

DROP TRIGGER IF EXISTS user_progress_check_achievements ON public.user_progress;
CREATE TRIGGER user_progress_check_achievements
  AFTER UPDATE OF current_streak, longest_streak, total_gems ON public.user_progress
  FOR EACH ROW
  WHEN (NEW.current_streak IS DISTINCT FROM OLD.current_streak
     OR NEW.longest_streak IS DISTINCT FROM OLD.longest_streak
     OR NEW.total_gems     IS DISTINCT FROM OLD.total_gems)
  EXECUTE FUNCTION public.tg_check_achievements();

-- Realtime: the Badges card listens for new rows.
DO $$
BEGIN
  PERFORM 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'achievements';
  IF NOT FOUND THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.achievements;
  END IF;
END $$;

COMMIT;
