BEGIN;

-- get_leaderboard_playlists: only return playlists the current user has imported.
-- participant_count still counts all public users who share the same playlist,
-- so the ranking is meaningful even though the selector is filtered to "my courses".

CREATE OR REPLACE FUNCTION public.get_leaderboard_playlists()
RETURNS TABLE (
  source_playlist_id text,
  title              text,
  thumbnail_url      text,
  participant_count  integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    my_c.source_playlist_id,
    (ARRAY_AGG(my_c.title         ORDER BY my_c.updated_at DESC))[1] AS title,
    (ARRAY_AGG(my_c.thumbnail_url ORDER BY my_c.updated_at DESC))[1] AS thumbnail_url,
    -- count all PUBLIC participants who also imported this playlist
    COUNT(DISTINCT
      CASE WHEN COALESCE(upref.profile_public, true) THEN all_c.user_id END
    )::integer AS participant_count
  FROM public.courses my_c
  -- join every other course copy with the same source playlist
  LEFT JOIN public.courses all_c
         ON all_c.source_playlist_id = my_c.source_playlist_id
  LEFT JOIN public.user_preferences upref
         ON upref.user_id = all_c.user_id
  WHERE my_c.source_playlist_id IS NOT NULL
    AND my_c.user_id = auth.uid()          -- ← only the current user's playlists
  GROUP BY my_c.source_playlist_id
  ORDER BY title ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_leaderboard_playlists() TO anon, authenticated;

COMMIT;
