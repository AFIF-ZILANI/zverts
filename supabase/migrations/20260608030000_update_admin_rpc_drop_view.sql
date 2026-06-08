BEGIN;

-- Drop compatibility view (no longer needed)
DROP VIEW IF EXISTS public.user_full_profile;

-- Update admin_list_users to join user_entitlements
CREATE OR REPLACE FUNCTION public.admin_list_users(_limit int DEFAULT 100, _search text DEFAULT NULL)
RETURNS TABLE(
  id uuid, email text, name text, ai_enabled boolean, is_paid_user boolean,
  free_playlist_used int, convert_credits int, total_paid int, locked boolean,
  created_at timestamptz, last_active timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id, p.email, p.name,
    COALESCE(e.ai_enabled, false),
    COALESCE(e.is_paid_user, false),
    COALESCE(e.free_playlist_used, 0),
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

COMMIT;
