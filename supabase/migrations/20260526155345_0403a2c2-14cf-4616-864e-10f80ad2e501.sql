CREATE OR REPLACE FUNCTION public.list_public_profiles(_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, name text, avatar_url text, total_xp integer, total_gems integer, current_streak integer, longest_streak integer, certificate_name text, profile_public boolean, created_at timestamp with time zone, last_active timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, name, avatar_url, total_xp, total_gems, current_streak, longest_streak,
         certificate_name, profile_public, created_at, last_active
  FROM public.profiles
  WHERE profile_public = true
  ORDER BY current_streak DESC NULLS LAST,
           total_gems DESC NULLS LAST,
           total_xp DESC NULLS LAST,
           name ASC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 200));
$function$;