-- Leaderboard order: gems, then streak, then XP (was streak, then gems).
-- Same signature and columns as 20260609010000; only ORDER BY changes, so the
-- top N fetched by the app are the same people rankRows() puts on top.

CREATE OR REPLACE FUNCTION public.list_public_profiles(_limit integer DEFAULT 50)
RETURNS TABLE(
  id              uuid,
  name            text,
  avatar_url      text,
  total_xp        integer,
  total_gems      integer,
  current_streak  integer,
  longest_streak  integer,
  certificate_name text,
  profile_public  boolean,
  created_at      timestamp with time zone,
  last_active     timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id,
    p.name,
    p.avatar_url,
    COALESCE(up.total_xp, 0)         AS total_xp,
    COALESCE(up.total_gems, 0)       AS total_gems,
    COALESCE(up.current_streak, 0)   AS current_streak,
    COALESCE(up.longest_streak, 0)   AS longest_streak,
    p.certificate_name,
    COALESCE(upref.profile_public, true) AS profile_public,
    p.created_at,
    p.last_active
  FROM public.profiles p
  LEFT JOIN public.user_progress     up    ON up.user_id    = p.id
  LEFT JOIN public.user_preferences  upref ON upref.user_id = p.id
  WHERE COALESCE(upref.profile_public, true) = true
  ORDER BY
    COALESCE(up.total_gems, 0)      DESC,
    COALESCE(up.current_streak, 0)  DESC,
    COALESCE(up.total_xp, 0)        DESC,
    p.name ASC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 200));
$$;
GRANT EXECUTE ON FUNCTION public.list_public_profiles(integer) TO anon, authenticated;
