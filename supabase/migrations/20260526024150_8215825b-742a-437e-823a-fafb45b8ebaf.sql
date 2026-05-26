
-- 1) Remove payments from realtime publication (admins use targeted channel/polling instead)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'payments'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.payments';
  END IF;
END $$;

-- 2) Restrict public achievements view to authenticated users (was public/anon)
DROP POLICY IF EXISTS achievements_select_public ON public.achievements;
CREATE POLICY achievements_select_public
ON public.achievements
FOR SELECT
TO authenticated
USING (public.is_profile_public(user_id));
