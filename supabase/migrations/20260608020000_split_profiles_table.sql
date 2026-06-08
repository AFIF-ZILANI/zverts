BEGIN;

-- ===========================================================
-- 1. CREATE NEW TABLES
-- ===========================================================

CREATE TABLE IF NOT EXISTS public.user_progress (
  user_id           uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_gems        integer NOT NULL DEFAULT 0,
  total_xp          integer NOT NULL DEFAULT 0,
  current_streak    integer NOT NULL DEFAULT 0,
  longest_streak    integer NOT NULL DEFAULT 0,
  last_attendance_date date
);

CREATE TABLE IF NOT EXISTS public.user_entitlements (
  user_id             uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_paid_user        boolean NOT NULL DEFAULT false,
  ai_enabled          boolean NOT NULL DEFAULT false,
  total_paid          numeric NOT NULL DEFAULT 0,
  convert_credits     integer NOT NULL DEFAULT 0,
  free_playlist_used  integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id                   uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  daily_goal_minutes        integer NOT NULL DEFAULT 30,
  study_reminders_enabled   boolean NOT NULL DEFAULT true,
  notify_email              boolean NOT NULL DEFAULT true,
  notify_inactivity         boolean NOT NULL DEFAULT true,
  notify_completion         boolean NOT NULL DEFAULT true,
  profile_public            boolean NOT NULL DEFAULT true
);

-- ===========================================================
-- 2. MIGRATE DATA FROM profiles
-- ===========================================================

INSERT INTO public.user_progress (user_id, total_gems, total_xp, current_streak, longest_streak, last_attendance_date)
SELECT
  id,
  COALESCE(total_gems, 0),
  COALESCE(total_xp, 0),
  COALESCE(current_streak, 0),
  COALESCE(longest_streak, 0),
  last_attendance_date
FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_entitlements (user_id, is_paid_user, ai_enabled, total_paid, convert_credits, free_playlist_used)
SELECT
  id,
  COALESCE(is_paid_user, false),
  COALESCE(ai_enabled, false),
  COALESCE(total_paid, 0),
  COALESCE(convert_credits, 0),
  COALESCE(free_playlist_used, 0)
FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_preferences (user_id, daily_goal_minutes, study_reminders_enabled, notify_email, notify_inactivity, notify_completion, profile_public)
SELECT
  id,
  COALESCE(daily_goal_minutes, 30),
  COALESCE(study_reminders_enabled, true),
  COALESCE(notify_email, true),
  COALESCE(notify_inactivity, true),
  COALESCE(notify_completion, true),
  COALESCE(profile_public, true)
FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- ===========================================================
-- 3. DROP OLD COLUMNS FROM profiles
-- ===========================================================

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS total_gems,
  DROP COLUMN IF EXISTS total_xp,
  DROP COLUMN IF EXISTS current_streak,
  DROP COLUMN IF EXISTS longest_streak,
  DROP COLUMN IF EXISTS last_attendance_date,
  DROP COLUMN IF EXISTS is_paid_user,
  DROP COLUMN IF EXISTS ai_enabled,
  DROP COLUMN IF EXISTS total_paid,
  DROP COLUMN IF EXISTS convert_credits,
  DROP COLUMN IF EXISTS free_playlist_used,
  DROP COLUMN IF EXISTS daily_goal_minutes,
  DROP COLUMN IF EXISTS study_reminders_enabled,
  DROP COLUMN IF EXISTS notify_email,
  DROP COLUMN IF EXISTS notify_inactivity,
  DROP COLUMN IF EXISTS notify_completion,
  DROP COLUMN IF EXISTS profile_public;

-- ===========================================================
-- 4. CREATE TRIGGER FUNCTIONS
-- ===========================================================

-- 4a. protect_progress_fields
CREATE OR REPLACE FUNCTION public.protect_progress_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') THEN RETURN NEW; END IF;
  NEW.total_xp              := OLD.total_xp;
  NEW.total_gems            := OLD.total_gems;
  NEW.current_streak        := OLD.current_streak;
  NEW.longest_streak        := OLD.longest_streak;
  NEW.last_attendance_date  := OLD.last_attendance_date;
  RETURN NEW;
END;
$$;

-- 4b. protect_entitlement_fields
CREATE OR REPLACE FUNCTION public.protect_entitlement_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') THEN RETURN NEW; END IF;
  NEW.is_paid_user       := OLD.is_paid_user;
  NEW.ai_enabled         := OLD.ai_enabled;
  NEW.total_paid         := OLD.total_paid;
  NEW.convert_credits    := OLD.convert_credits;
  NEW.free_playlist_used := OLD.free_playlist_used;
  RETURN NEW;
END;
$$;

-- 4c. protect_profile_fields (trimmed — only locked + role remain)
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') THEN RETURN NEW; END IF;
  NEW.locked := OLD.locked;
  NEW.role   := OLD.role;
  RETURN NEW;
END;
$$;

-- 4d. progress_milestone_notify (was profile_milestone_notify)
CREATE OR REPLACE FUNCTION public.progress_milestone_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old_level int := COALESCE(OLD.total_xp, 0) / 500;
  _new_level int := COALESCE(NEW.total_xp, 0) / 500;
BEGIN
  IF _new_level > _old_level THEN
    PERFORM public.dispatch_notification(
      NEW.user_id, 'level_up',
      'Level Up! 🚀 Level ' || _new_level,
      'Boss মুডে আছেন 🔥 আরেকটা lesson দিলে আরও এগাবেন!',
      'high', '/dashboard', jsonb_build_object('level', _new_level),
      'level_up:' || _new_level::text, 6);
  END IF;
  IF NEW.current_streak IN (3, 7, 14, 30, 60, 100) AND NEW.current_streak > COALESCE(OLD.current_streak, 0) THEN
    PERFORM public.dispatch_notification(
      NEW.user_id, 'streak_milestone',
      'Streak ' || NEW.current_streak || ' দিন! 🔥',
      'Consistency-ই king 👑 চালায়া যান!',
      'high', '/dashboard', jsonb_build_object('streak', NEW.current_streak),
      'streak:' || NEW.current_streak::text, 12);
  END IF;
  RETURN NEW;
END;
$$;

-- 4e. auto-insert rows for new profiles
CREATE OR REPLACE FUNCTION public.create_user_satellite_rows()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_progress (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_entitlements (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- ===========================================================
-- 5. CREATE TRIGGERS
-- ===========================================================

DROP TRIGGER IF EXISTS trg_protect_progress ON public.user_progress;
CREATE TRIGGER trg_protect_progress
  BEFORE UPDATE ON public.user_progress
  FOR EACH ROW EXECUTE FUNCTION public.protect_progress_fields();

DROP TRIGGER IF EXISTS trg_protect_entitlements ON public.user_entitlements;
CREATE TRIGGER trg_protect_entitlements
  BEFORE UPDATE ON public.user_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.protect_entitlement_fields();

DROP TRIGGER IF EXISTS trg_protect_profile ON public.profiles;
CREATE TRIGGER trg_protect_profile
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

DROP TRIGGER IF EXISTS trg_progress_milestone_notify ON public.user_progress;
CREATE TRIGGER trg_progress_milestone_notify
  AFTER UPDATE ON public.user_progress
  FOR EACH ROW EXECUTE FUNCTION public.progress_milestone_notify();

DROP TRIGGER IF EXISTS trg_create_user_satellite_rows ON public.profiles;
CREATE TRIGGER trg_create_user_satellite_rows
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_user_satellite_rows();

-- ===========================================================
-- 6. DROP OLD TRIGGERS AND FUNCTIONS
-- ===========================================================

DROP TRIGGER IF EXISTS trg_profile_milestone_notify ON public.profiles;
DROP FUNCTION IF EXISTS public.profile_milestone_notify();

-- ===========================================================
-- 7. CREATE INDEXES
-- ===========================================================

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_entitlements_is_paid_user ON public.user_entitlements(is_paid_user);
CREATE INDEX IF NOT EXISTS idx_user_progress_last_attendance_date ON public.user_progress(last_attendance_date);

-- ===========================================================
-- 8. ENABLE RLS ON NEW TABLES
-- ===========================================================

ALTER TABLE public.user_progress    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences  ENABLE ROW LEVEL SECURITY;

-- ===========================================================
-- 9. RLS POLICIES
-- ===========================================================

-- user_progress
CREATE POLICY "user_progress_select_own" ON public.user_progress
  TO public USING (auth.uid() = user_id);

CREATE POLICY "user_progress_update_own" ON public.user_progress
  TO public USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_progress_admin_select" ON public.user_progress
  TO public USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- user_entitlements
CREATE POLICY "user_entitlements_select_own" ON public.user_entitlements
  TO public USING (auth.uid() = user_id);

CREATE POLICY "user_entitlements_update_own" ON public.user_entitlements
  TO public USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_entitlements_admin_select" ON public.user_entitlements
  TO public USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- user_preferences
CREATE POLICY "user_preferences_select_own" ON public.user_preferences
  TO public USING (auth.uid() = user_id);

CREATE POLICY "user_preferences_update_own" ON public.user_preferences
  TO public USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_preferences_admin_select" ON public.user_preferences
  TO public USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- ===========================================================
-- 10. COMPATIBILITY VIEW
-- ===========================================================

CREATE OR REPLACE VIEW public.user_full_profile AS
SELECT
  p.*,
  up.total_gems,
  up.total_xp,
  up.current_streak,
  up.longest_streak,
  up.last_attendance_date,
  ue.is_paid_user,
  ue.ai_enabled,
  ue.total_paid,
  ue.convert_credits,
  ue.free_playlist_used,
  upref.daily_goal_minutes,
  upref.study_reminders_enabled,
  upref.notify_email,
  upref.notify_inactivity,
  upref.notify_completion,
  upref.profile_public
FROM public.profiles p
LEFT JOIN public.user_progress up ON up.user_id = p.id
LEFT JOIN public.user_entitlements ue ON ue.user_id = p.id
LEFT JOIN public.user_preferences upref ON upref.user_id = p.id;

COMMIT;
