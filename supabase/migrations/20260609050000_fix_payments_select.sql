-- 20260608000000 created payments_block_direct_writes AS RESTRICTIVE FOR ALL.
-- RESTRICTIVE policies are ANDed with permissive ones — FOR ALL means it also
-- applies to SELECT, so USING (false) silently returns 0 rows for every user
-- even though payments_select_own is permissive and would allow them.
--
-- Fix: scope the restrictive policy to write commands only (INSERT, UPDATE, DELETE).
-- SELECT falls through to the permissive payments_select_own policy as intended.

DROP POLICY IF EXISTS payments_block_direct_writes ON public.payments;

CREATE POLICY payments_block_direct_writes ON public.payments
  AS RESTRICTIVE FOR INSERT, UPDATE, DELETE TO authenticated, anon
  USING (false) WITH CHECK (false);
