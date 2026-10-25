-- is_profile_public() still read profiles.profile_public, which
-- 20260608020000_split_profiles_table moved to user_preferences. Every read of
-- public.achievements evaluates the achievements_select_public policy, so the
-- missing column failed them all (42703), including a user's own badges.
-- Read the setting from its new home; no preference row stays private, as before.
CREATE OR REPLACE FUNCTION public.is_profile_public(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT profile_public FROM public.user_preferences WHERE user_id = _uid), false);
$$;
