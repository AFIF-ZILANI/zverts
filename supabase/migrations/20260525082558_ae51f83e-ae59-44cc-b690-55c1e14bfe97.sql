
-- Trigger to protect gamification fields on profiles from direct client updates.
-- SECURITY DEFINER functions (award_progress, mark_attendance, etc.) bypass this
-- because they run as the function owner, not as the end user.

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Admins can change anything
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Restore protected fields to their previous values for normal user updates
  NEW.total_xp := OLD.total_xp;
  NEW.total_gems := OLD.total_gems;
  NEW.current_streak := OLD.current_streak;
  NEW.longest_streak := OLD.longest_streak;
  NEW.last_attendance_date := OLD.last_attendance_date;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_fields_trg ON public.profiles;
CREATE TRIGGER protect_profile_fields_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_fields();
