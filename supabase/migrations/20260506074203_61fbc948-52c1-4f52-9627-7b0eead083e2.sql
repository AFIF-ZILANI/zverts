
-- Add preference & notification columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_goal_minutes INT NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS study_reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_email BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_inactivity BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_completion BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS profile_public BOOLEAN NOT NULL DEFAULT true;

-- RPC: reset all learning progress for the calling user
CREATE OR REPLACE FUNCTION public.reset_my_progress()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.module_progress WHERE user_id = _uid;
  DELETE FROM public.mcq_attempts WHERE user_id = _uid;
  DELETE FROM public.attendance WHERE user_id = _uid;
  DELETE FROM public.certificates WHERE user_id = _uid;
  UPDATE public.profiles
    SET total_gems = 0, total_xp = 0, current_streak = 0, longest_streak = 0,
        last_attendance_date = NULL
    WHERE id = _uid;
END; $$;

-- Allow public viewing of profiles when profile_public is true (for leaderboards / shared courses)
DROP POLICY IF EXISTS profiles_select_public ON public.profiles;
CREATE POLICY profiles_select_public ON public.profiles
  FOR SELECT USING (profile_public = true OR auth.uid() = id);
