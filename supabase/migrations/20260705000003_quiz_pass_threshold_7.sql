BEGIN;

-- Lower quiz pass threshold from 8 to 7 correct answers.
-- Only the single comparison line changes; rest of submit_mcq is identical.

CREATE OR REPLACE FUNCTION public.submit_mcq(_module_id UUID, _answers JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid            UUID := auth.uid();
  _q              RECORD;
  _score          INT := 0;
  _total          INT := 0;
  _passed         BOOLEAN;
  _user_ans       INT;
  _already_passed BOOLEAN;
  _current_streak INT;
  _new_streak     INT := 0;
  _must_rewatch   BOOLEAN := false;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  FOR _q IN
    SELECT id, correct_index
    FROM public.mcq_questions
    WHERE module_id = _module_id
    ORDER BY position
  LOOP
    _total    := _total + 1;
    _user_ans := COALESCE((_answers ->> _q.id::text)::int, -1);
    IF _user_ans = _q.correct_index THEN _score := _score + 1; END IF;
  END LOOP;

  IF _total = 0 THEN RAISE EXCEPTION 'No questions for module'; END IF;

  _passed := _score >= 7;  -- ← was 8, now 7

  INSERT INTO public.mcq_attempts (user_id, module_id, score, total, passed, answers)
  VALUES (_uid, _module_id, _score, _total, _passed, _answers);

  IF _passed THEN
    SELECT mcq_passed INTO _already_passed
    FROM public.module_progress
    WHERE user_id = _uid AND module_id = _module_id;

    UPDATE public.module_progress
    SET mcq_passed       = true,
        quiz_fail_streak = 0
    WHERE user_id = _uid AND module_id = _module_id;

    IF NOT COALESCE(_already_passed, false) THEN
      PERFORM public.award_progress(_uid, 1, 30);
    END IF;

    _new_streak := 0;

  ELSE
    SELECT COALESCE(quiz_fail_streak, 0) INTO _current_streak
    FROM public.module_progress
    WHERE user_id = _uid AND module_id = _module_id;

    _new_streak := COALESCE(_current_streak, 0) + 1;

    IF _new_streak >= 3 THEN
      UPDATE public.module_progress
      SET quiz_fail_streak  = 0,
          completed          = false,
          video_finished     = false,
          mcq_passed         = false,
          completed_at       = NULL,
          watch_time_seconds = 0,
          percent_watched    = 0,
          updated_at         = now()
      WHERE user_id = _uid AND module_id = _module_id;

      _must_rewatch := true;
      _new_streak   := 0;
    ELSE
      UPDATE public.module_progress
      SET quiz_fail_streak = _new_streak,
          updated_at        = now()
      WHERE user_id = _uid AND module_id = _module_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'score',        _score,
    'total',        _total,
    'passed',       _passed,
    'must_rewatch', _must_rewatch,
    'fail_streak',  _new_streak
  );
END $$;

COMMIT;
