
-- 1. COURSES
CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  source_playlist_id TEXT,
  source_playlist_url TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY courses_select_own_or_public ON public.courses FOR SELECT USING (
  is_public = true OR is_system = true OR user_id = auth.uid() OR public.has_role(auth.uid(),'admin')
);
CREATE POLICY courses_insert_own ON public.courses FOR INSERT WITH CHECK (auth.uid() = user_id AND is_system = false);
CREATE POLICY courses_update_own ON public.courses FOR UPDATE USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY courses_delete_own ON public.courses FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- 2. MODULES — add course_id, thumbnail
ALTER TABLE public.modules ADD COLUMN course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE;
ALTER TABLE public.modules ADD COLUMN thumbnail_url TEXT;

-- Seed system course and attach existing modules
INSERT INTO public.courses (id, user_id, title, description, is_public, is_system)
VALUES ('00000000-0000-0000-0000-00000000000d', NULL, 'ZeroD Foundations', 'The official ZeroD starter playlist. Disciplined sequential learning.', true, true);

UPDATE public.modules SET course_id = '00000000-0000-0000-0000-00000000000d' WHERE course_id IS NULL;
ALTER TABLE public.modules ALTER COLUMN course_id SET NOT NULL;

-- Drop old position uniqueness assumptions; add per-course position unique
CREATE UNIQUE INDEX modules_course_position_idx ON public.modules (course_id, position);

-- Allow course owners to manage their modules
CREATE POLICY modules_owner_write ON public.modules FOR ALL
  USING (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = modules.course_id AND (c.user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = modules.course_id AND (c.user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

-- 3. PROFILES gamification
ALTER TABLE public.profiles
  ADD COLUMN total_gems INT NOT NULL DEFAULT 0,
  ADD COLUMN total_xp INT NOT NULL DEFAULT 0,
  ADD COLUMN current_streak INT NOT NULL DEFAULT 0,
  ADD COLUMN longest_streak INT NOT NULL DEFAULT 0,
  ADD COLUMN last_attendance_date DATE,
  ADD COLUMN certificate_name TEXT,
  ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'en';

-- 4. MCQ
CREATE TABLE public.mcq_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL,           -- ["A","B","C","D"]
  correct_index INT NOT NULL,
  explanation TEXT,
  position INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mcq_questions_module_idx ON public.mcq_questions(module_id, position);
ALTER TABLE public.mcq_questions ENABLE ROW LEVEL SECURITY;
-- Authenticated users can read questions WITHOUT correct_index via a view. Simpler: read but server validates submissions.
CREATE POLICY mcq_questions_read ON public.mcq_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY mcq_questions_admin_all ON public.mcq_questions FOR ALL USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.mcq_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  score INT NOT NULL,
  total INT NOT NULL,
  passed BOOLEAN NOT NULL,
  answers JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mcq_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY mcq_attempts_select_own ON public.mcq_attempts FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
-- Inserts only via SECURITY DEFINER function; no insert policy needed.

-- module_progress: add mcq_passed flag
ALTER TABLE public.module_progress ADD COLUMN mcq_passed BOOLEAN NOT NULL DEFAULT false;

-- 5. ATTENDANCE
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY attendance_select_own ON public.attendance FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- 6. NOTES
CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  timestamp_seconds INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY notes_all_own ON public.notes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 7. CERTIFICATES
CREATE TABLE public.certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  certificate_code TEXT NOT NULL UNIQUE,
  issued_to_name TEXT NOT NULL,
  course_title TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, course_id)
);
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY certs_public_select ON public.certificates FOR SELECT USING (true); -- certificates verifiable by code
CREATE POLICY certs_admin_all ON public.certificates FOR ALL USING (public.has_role(auth.uid(),'admin'));

-- 8. EMAIL LOGS
CREATE TABLE public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email TEXT NOT NULL,
  email_type TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_logs_admin ON public.email_logs FOR SELECT USING (public.has_role(auth.uid(),'admin'));

-- 9. STORAGE: avatars bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars','avatars',true)
ON CONFLICT (id) DO NOTHING;
CREATE POLICY avatars_public_read ON storage.objects FOR SELECT USING (bucket_id='avatars');
CREATE POLICY avatars_user_insert ON storage.objects FOR INSERT WITH CHECK (bucket_id='avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY avatars_user_update ON storage.objects FOR UPDATE USING (bucket_id='avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY avatars_user_delete ON storage.objects FOR DELETE USING (bucket_id='avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 10. RPCs
-- is_module_unlocked rewritten per-course
CREATE OR REPLACE FUNCTION public.is_module_unlocked(_user_id UUID, _module_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _pos INT; _course UUID; _prev_completed BOOLEAN;
BEGIN
  SELECT position, course_id INTO _pos, _course FROM public.modules WHERE id = _module_id;
  IF _pos IS NULL THEN RETURN false; END IF;
  IF _pos = 1 THEN RETURN true; END IF;
  SELECT COALESCE(mp.completed,false) INTO _prev_completed
  FROM public.modules m
  LEFT JOIN public.module_progress mp ON mp.module_id = m.id AND mp.user_id = _user_id
  WHERE m.course_id = _course AND m.position = _pos - 1;
  RETURN COALESCE(_prev_completed,false);
END; $$;

-- Award gems/xp helper
CREATE OR REPLACE FUNCTION public.award_progress(_user_id UUID, _gems INT, _xp INT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.profiles SET total_gems = total_gems + _gems, total_xp = total_xp + _xp WHERE id = _user_id;
$$;

-- Update module progress now also awards +2 gems +50 xp first time complete
CREATE OR REPLACE FUNCTION public.update_module_progress(_module_id UUID, _watch_time INT, _force_complete BOOLEAN DEFAULT false)
RETURNS public.module_progress LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF _newly_completed THEN PERFORM public.award_progress(_uid, 2, 50); END IF;
  RETURN _result;
END; $$;

-- Submit MCQ — validates server-side, awards +1 gem +30 xp on pass (only first pass)
CREATE OR REPLACE FUNCTION public.submit_mcq(_module_id UUID, _answers JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _q RECORD; _score INT := 0; _total INT := 0;
        _passed BOOLEAN; _user_ans INT; _already_passed BOOLEAN;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  FOR _q IN SELECT id, correct_index FROM public.mcq_questions WHERE module_id = _module_id ORDER BY position LOOP
    _total := _total + 1;
    _user_ans := COALESCE((_answers ->> _q.id::text)::int, -1);
    IF _user_ans = _q.correct_index THEN _score := _score + 1; END IF;
  END LOOP;
  IF _total = 0 THEN RAISE EXCEPTION 'No questions for module'; END IF;
  _passed := _score >= 8;
  INSERT INTO public.mcq_attempts (user_id, module_id, score, total, passed, answers)
  VALUES (_uid, _module_id, _score, _total, _passed, _answers);
  IF _passed THEN
    SELECT mcq_passed INTO _already_passed FROM public.module_progress WHERE user_id = _uid AND module_id = _module_id;
    IF NOT COALESCE(_already_passed, false) THEN
      UPDATE public.module_progress SET mcq_passed = true WHERE user_id = _uid AND module_id = _module_id;
      PERFORM public.award_progress(_uid, 1, 30);
    END IF;
  END IF;
  RETURN jsonb_build_object('score',_score,'total',_total,'passed',_passed);
END; $$;

-- Mark attendance + update streak
CREATE OR REPLACE FUNCTION public.mark_attendance()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _today DATE := (now() AT TIME ZONE 'UTC')::date;
        _last DATE; _streak INT; _longest INT; _new_streak INT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.attendance (user_id, date) VALUES (_uid, _today) ON CONFLICT DO NOTHING;
  SELECT last_attendance_date, current_streak, longest_streak INTO _last, _streak, _longest FROM public.profiles WHERE id = _uid;
  IF _last = _today THEN
    RETURN jsonb_build_object('streak',_streak,'already',true);
  ELSIF _last = _today - INTERVAL '1 day' THEN
    _new_streak := _streak + 1;
  ELSE
    _new_streak := 1;
  END IF;
  UPDATE public.profiles SET current_streak = _new_streak,
    longest_streak = GREATEST(_longest, _new_streak),
    last_attendance_date = _today,
    last_active = now()
  WHERE id = _uid;
  RETURN jsonb_build_object('streak',_new_streak,'already',false);
END; $$;

-- Issue certificate (only if all modules in course completed)
CREATE OR REPLACE FUNCTION public.issue_certificate(_course_id UUID)
RETURNS public.certificates LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _name TEXT; _course TEXT; _total INT; _done INT; _existing public.certificates%ROWTYPE; _new public.certificates%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _existing FROM public.certificates WHERE user_id = _uid AND course_id = _course_id;
  IF FOUND THEN RETURN _existing; END IF;
  SELECT COUNT(*) INTO _total FROM public.modules WHERE course_id = _course_id;
  SELECT COUNT(*) INTO _done FROM public.module_progress mp JOIN public.modules m ON m.id = mp.module_id
    WHERE m.course_id = _course_id AND mp.user_id = _uid AND mp.completed = true;
  IF _total = 0 OR _done < _total THEN RAISE EXCEPTION 'Course not yet complete'; END IF;
  SELECT COALESCE(certificate_name, name, email) INTO _name FROM public.profiles WHERE id = _uid;
  SELECT title INTO _course FROM public.courses WHERE id = _course_id;
  INSERT INTO public.certificates (user_id, course_id, certificate_code, issued_to_name, course_title)
  VALUES (_uid, _course_id, 'ZD-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)), _name, _course)
  RETURNING * INTO _new;
  RETURN _new;
END; $$;

-- Promote admin via signup trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, avatar_url, certificate_name)
  VALUES (NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)));
  IF lower(NEW.email) = 'tauhidrana00@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
