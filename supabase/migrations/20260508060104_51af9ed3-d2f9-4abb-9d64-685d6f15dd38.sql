
-- Achievements
CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  code TEXT NOT NULL,
  metadata JSONB,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, code)
);
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY achievements_select_own ON public.achievements FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY achievements_select_public ON public.achievements FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = achievements.user_id AND p.profile_public = true));

-- Daily challenges
CREATE TABLE IF NOT EXISTS public.daily_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  module_id UUID,
  score INT NOT NULL DEFAULT 0,
  total INT NOT NULL DEFAULT 0,
  passed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);
ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY daily_select_own ON public.daily_challenges FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- Award a badge once
CREATE OR REPLACE FUNCTION public.award_achievement(_user_id UUID, _code TEXT, _xp INT DEFAULT 25, _gems INT DEFAULT 1)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _existed BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.achievements WHERE user_id=_user_id AND code=_code) INTO _existed;
  IF _existed THEN RETURN false; END IF;
  INSERT INTO public.achievements(user_id, code) VALUES (_user_id, _code);
  PERFORM public.award_progress(_user_id, _gems, _xp);
  RETURN true;
END $$;

-- Check & unlock achievements based on current state
CREATE OR REPLACE FUNCTION public.check_achievements()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _streak INT; _gems INT; _completed_modules INT; _completed_courses INT;
        _passed_quizzes INT; _new TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT current_streak, total_gems INTO _streak, _gems FROM public.profiles WHERE id = _uid;
  SELECT COUNT(*) INTO _completed_modules FROM public.module_progress WHERE user_id=_uid AND completed=true;
  SELECT COUNT(*) INTO _passed_quizzes FROM public.module_progress WHERE user_id=_uid AND mcq_passed=true;
  SELECT COUNT(DISTINCT c.id) INTO _completed_courses
    FROM public.courses c
    WHERE EXISTS (SELECT 1 FROM public.modules m WHERE m.course_id=c.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.modules m
        LEFT JOIN public.module_progress mp ON mp.module_id=m.id AND mp.user_id=_uid
        WHERE m.course_id=c.id AND COALESCE(mp.completed,false)=false
      );

  IF _streak >= 7 AND public.award_achievement(_uid, 'streak_7', 50, 3) THEN _new := array_append(_new, 'streak_7'); END IF;
  IF _streak >= 30 AND public.award_achievement(_uid, 'streak_30', 200, 10) THEN _new := array_append(_new, 'streak_30'); END IF;
  IF _completed_modules >= 1 AND public.award_achievement(_uid, 'first_module', 25, 1) THEN _new := array_append(_new, 'first_module'); END IF;
  IF _completed_modules >= 10 AND public.award_achievement(_uid, 'modules_10', 75, 3) THEN _new := array_append(_new, 'modules_10'); END IF;
  IF _completed_modules >= 50 AND public.award_achievement(_uid, 'modules_50', 250, 10) THEN _new := array_append(_new, 'modules_50'); END IF;
  IF _completed_courses >= 1 AND public.award_achievement(_uid, 'first_course', 100, 5) THEN _new := array_append(_new, 'first_course'); END IF;
  IF _passed_quizzes >= 5 AND public.award_achievement(_uid, 'quiz_master', 75, 3) THEN _new := array_append(_new, 'quiz_master'); END IF;
  IF _gems >= 100 AND public.award_achievement(_uid, 'gems_100', 50, 0) THEN _new := array_append(_new, 'gems_100'); END IF;

  RETURN jsonb_build_object('new', _new);
END $$;

-- Submit daily challenge
CREATE OR REPLACE FUNCTION public.submit_daily_challenge(_module_id UUID, _score INT, _total INT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _today DATE := (now() AT TIME ZONE 'UTC')::date;
        _passed BOOLEAN; _existing public.daily_challenges%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _passed := _total > 0 AND (_score::NUMERIC / _total) >= 0.6;
  SELECT * INTO _existing FROM public.daily_challenges WHERE user_id=_uid AND date=_today;
  IF FOUND THEN
    RETURN jsonb_build_object('already', true, 'passed', _existing.passed, 'score', _existing.score, 'total', _existing.total);
  END IF;
  INSERT INTO public.daily_challenges(user_id, date, module_id, score, total, passed)
    VALUES (_uid, _today, _module_id, _score, _total, _passed);
  IF _passed THEN PERFORM public.award_progress(_uid, 2, 75); END IF;
  RETURN jsonb_build_object('already', false, 'passed', _passed, 'score', _score, 'total', _total);
END $$;
