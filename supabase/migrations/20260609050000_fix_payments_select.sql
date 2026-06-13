-- 20260608000000 created payments_block_direct_writes AS RESTRICTIVE FOR ALL.
-- RESTRICTIVE policies are ANDed with permissive ones — FOR ALL means it also
-- applies to SELECT, so USING (false) silently returns 0 rows for every user
-- even though payments_select_own is permissive and would allow them.
--
-- Fix: drop FOR ALL and scope restrictions to write commands only.
-- SELECT falls through to the permissive payments_select_own policy as intended.
-- Postgres does not support multi-command policies; use separate policies per command.

DROP POLICY IF EXISTS payments_block_direct_writes ON public.payments;
DROP POLICY IF EXISTS payments_block_delete ON public.payments;
DROP POLICY IF EXISTS payments_block_update ON public.payments;

CREATE POLICY payments_block_delete ON public.payments
  AS RESTRICTIVE FOR DELETE TO authenticated, anon
  USING (false);

CREATE POLICY payments_block_update ON public.payments
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon
  USING (false);
