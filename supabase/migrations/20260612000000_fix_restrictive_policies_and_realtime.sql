-- Fix RESTRICTIVE FOR ALL policies that silently block SELECT queries.
--
-- PostgreSQL RESTRICTIVE policies are ANDed with permissive ones.
-- FOR ALL with USING(false) overrides any permissive SELECT policy,
-- returning 0 rows to every authenticated query. Scope them to write
-- commands only — SELECT falls through to the permissive policies.
--
-- Affected tables: achievements, ai_usage, daily_challenges,
--   daily_missions, mcq_attempts, user_behavior.
-- (attendance and payments were fixed in 20260609060000 / 20260609050000)

-- achievements
DROP POLICY IF EXISTS achievements_block_direct_writes ON public.achievements;
CREATE POLICY achievements_block_direct_writes_ins ON public.achievements AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY achievements_block_direct_writes_upd ON public.achievements AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false);
CREATE POLICY achievements_block_direct_writes_del ON public.achievements AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);

-- ai_usage
DROP POLICY IF EXISTS ai_usage_block_direct_writes ON public.ai_usage;
CREATE POLICY ai_usage_block_direct_writes_ins ON public.ai_usage AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY ai_usage_block_direct_writes_upd ON public.ai_usage AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false);
CREATE POLICY ai_usage_block_direct_writes_del ON public.ai_usage AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);

-- daily_challenges
DROP POLICY IF EXISTS daily_challenges_block_direct_writes ON public.daily_challenges;
CREATE POLICY daily_challenges_block_writes_ins ON public.daily_challenges AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY daily_challenges_block_writes_upd ON public.daily_challenges AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false);
CREATE POLICY daily_challenges_block_writes_del ON public.daily_challenges AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);

-- daily_missions
DROP POLICY IF EXISTS missions_block_writes ON public.daily_missions;
CREATE POLICY daily_missions_block_writes_ins ON public.daily_missions AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY daily_missions_block_writes_upd ON public.daily_missions AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false);
CREATE POLICY daily_missions_block_writes_del ON public.daily_missions AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);

-- mcq_attempts
DROP POLICY IF EXISTS mcq_attempts_block_direct_writes ON public.mcq_attempts;
CREATE POLICY mcq_attempts_block_direct_writes_ins ON public.mcq_attempts AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY mcq_attempts_block_direct_writes_upd ON public.mcq_attempts AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false);
CREATE POLICY mcq_attempts_block_direct_writes_del ON public.mcq_attempts AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);

-- user_behavior
DROP POLICY IF EXISTS user_behavior_block_direct_writes ON public.user_behavior;
CREATE POLICY user_behavior_block_direct_writes_ins ON public.user_behavior AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY user_behavior_block_direct_writes_upd ON public.user_behavior AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false);
CREATE POLICY user_behavior_block_direct_writes_del ON public.user_behavior AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);

-- ===========================================================
-- Realtime: add missing tables and ensure REPLICA IDENTITY FULL
-- ===========================================================
-- profiles, module_progress, notifications were supposed to be added in
-- 20260527050533, and payments in 20260529171028, but the publication was
-- never actually populated with those tables in this project.

ALTER TABLE public.profiles      REPLICA IDENTITY FULL;
ALTER TABLE public.module_progress REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.payments      REPLICA IDENTITY FULL;
ALTER TABLE public.user_progress REPLICA IDENTITY FULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','module_progress','notifications','payments','user_progress'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END;
$$;
