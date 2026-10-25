-- admin_list_support_contacts still read profiles.is_paid_user, which
-- 20260608020000_split_profiles_table moved to user_entitlements, so every call
-- failed with 42703 and the admin Support Contacts page showed nothing.
CREATE OR REPLACE FUNCTION public.admin_list_support_contacts(_search text DEFAULT NULL, _limit integer DEFAULT 500)
RETURNS TABLE(
  id uuid, user_id uuid, name text, email text, country_code text, phone_number text,
  whatsapp_enabled boolean, source text, submitted_at timestamptz,
  joined_at timestamptz, last_active timestamptz, is_paid_user boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT sc.id, sc.user_id, sc.name, COALESCE(sc.email, p.email) AS email,
         sc.country_code, sc.phone_number, sc.whatsapp_enabled, sc.source, sc.submitted_at,
         p.created_at AS joined_at, p.last_active, COALESCE(ue.is_paid_user, false)
  FROM public.support_contacts sc
  LEFT JOIN public.profiles p ON p.id = sc.user_id
  LEFT JOIN public.user_entitlements ue ON ue.user_id = sc.user_id
  WHERE (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
    AND (_search IS NULL OR _search = ''
         OR sc.name ILIKE '%'||_search||'%'
         OR sc.phone_number ILIKE '%'||_search||'%'
         OR COALESCE(sc.email, p.email) ILIKE '%'||_search||'%')
  ORDER BY sc.submitted_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 2000));
$$;

-- consume_conversion() is called by nothing (app, edge functions or SQL) and
-- reads profiles.free_playlist_used / convert_credits, which no longer exist.
DROP FUNCTION IF EXISTS public.consume_conversion();
