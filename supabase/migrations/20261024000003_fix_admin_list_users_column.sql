BEGIN;

-- admin_list_users still selected user_entitlements.free_playlist_used, which
-- 20260609040000 renamed to playlist_conversions_left, so the admin Users page
-- failed with "column e.free_playlist_used does not exist". The return type
-- changes, so the function has to be dropped and recreated.
DROP FUNCTION IF EXISTS public.admin_list_users(int, text);

CREATE FUNCTION public.admin_list_users(_limit int DEFAULT 100, _search text DEFAULT NULL)
RETURNS TABLE(
  id uuid, email text, name text, ai_enabled boolean, is_paid_user boolean,
  playlist_conversions_left int, convert_credits int, total_paid int, locked boolean,
  created_at timestamptz, last_active timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id, p.email, p.name,
    COALESCE(e.ai_enabled, false),
    COALESCE(e.is_paid_user, false),
    COALESCE(e.playlist_conversions_left, 0),
    COALESCE(e.convert_credits, 0),
    COALESCE(e.total_paid, 0)::int,
    p.locked,
    p.created_at, p.last_active
  FROM public.profiles p
  LEFT JOIN public.user_entitlements e ON e.user_id = p.id
  WHERE (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
    AND (_search IS NULL OR _search = '' OR p.email ILIKE '%'||_search||'%' OR p.name ILIKE '%'||_search||'%')
  ORDER BY p.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 500));
$$;

-- Recreating the function resets its grants; keep it off anon (20260609020000).
REVOKE EXECUTE ON FUNCTION public.admin_list_users(int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(int, text) TO authenticated;

COMMIT;
